import http from "node:http";
import type { AddressInfo } from "node:net";

// A stand-in for Anthropic's API on this machine, so the end-to-end tests run the real chat
// without the network. The built API is pointed at it with ANTHROPIC_BASE_URL, which production
// refuses. It accepts one made-up key and records what each request carried.

/** The only key the stand-in accepts. Made up, and short enough not to look real. */
export const GOOD_KEY = "sk-ant-e2e-good";
export const OPENER = "Hi! Who would use this first, and what do they do today?";
export const NEXT_QUESTION = "How often does that go wrong for them?";
export const DRAFT = {
  summary: "Cousins who share family recipes as photos in a group chat, where they get lost.",
  points: ["Photos get buried in the chat", "Nobody can find the old cards"],
};

export interface SeenRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  apiKeyHeader: string | undefined;
  beta: string | undefined;
  body: Record<string, unknown> | null;
}

export interface FakeAnthropic {
  origin: string;
  requests: SeenRequest[];
  stop(): Promise<void>;
}

const USAGE = {
  input_tokens: 1500,
  output_tokens: 60,
  cache_read_input_tokens: 1200,
  cache_creation_input_tokens: 0,
};

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "request-id": "req_e2e" });
  res.end(JSON.stringify(body));
}

function message(text: string) {
  return {
    id: "msg_e2e",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: USAGE,
  };
}

export async function startFakeAnthropic(): Promise<FakeAnthropic> {
  const requests: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://fake");
      let body: Record<string, unknown> | null = null;
      try {
        body = chunks.length
          ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>)
          : null;
      } catch {
        body = null;
      }
      requests.push({
        method: req.method ?? "",
        path: url.pathname,
        authorization: req.headers.authorization,
        apiKeyHeader: req.headers["x-api-key"] as string | undefined,
        beta: req.headers["anthropic-beta"] as string | undefined,
        body,
      });
      if (req.headers.authorization !== `Bearer ${GOOD_KEY}`) {
        json(res, 401, {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/models") {
        json(res, 200, {
          data: [{ id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" }],
          has_more: false,
          first_id: "claude-opus-5-5",
          last_id: "claude-opus-5-5",
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/messages") {
        const messages = (body?.messages as unknown[] | undefined) ?? [];
        const config = body?.output_config as { format?: unknown } | undefined;
        if (config?.format) {
          json(res, 200, message(JSON.stringify(DRAFT)));
        } else {
          json(res, 200, message(messages.length <= 1 ? OPENER : NEXT_QUESTION));
        }
        return;
      }
      json(res, 404, { type: "error", error: { type: "not_found_error", message: "Not found" } });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
