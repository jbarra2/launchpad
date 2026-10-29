// A stand-in for the Anthropic SDK's client, put in place for every API test by
// tests/setup/fake-anthropic.ts, so no test can reach Anthropic. A test queues what the next calls
// answer, and reads back the clients that were made and the requests that were sent.
//
// This file must not import "@anthropic-ai/sdk": the mock of that module loads this file. Errors to
// throw come from tests/helpers/claude-errors.ts.

export interface FakeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

type Answer =
  | {
      kind: "message";
      content: { type: string; text?: string }[];
      stopReason: string;
      model?: string;
      usage?: Partial<Record<keyof FakeUsage, number | null>>;
    }
  | { kind: "models" }
  | { kind: "error"; error: unknown };

interface Queued {
  answer: Answer;
  /** Resolves when the test lets the call finish. */
  gate?: Promise<void>;
}

export const FAKE_USAGE: FakeUsage = {
  input_tokens: 1200,
  output_tokens: 80,
  cache_read_input_tokens: 900,
  cache_creation_input_tokens: 300,
};

const queue: Queued[] = [];
export const clients: Record<string, unknown>[] = [];
export const requests: { endpoint: "messages" | "models"; body: unknown }[] = [];

async function next(endpoint: "messages" | "models", body: unknown) {
  requests.push({ endpoint, body });
  const queued = queue.shift();
  if (!queued) {
    throw new Error(`The fake Claude has no answer queued for ${endpoint}.`);
  }
  await queued.gate;
  const { answer } = queued;
  if (answer.kind === "error") {
    throw answer.error;
  }
  if (answer.kind === "models") {
    return { data: [{ id: "claude-opus-5-5", type: "model" }], has_more: false };
  }
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: answer.model ?? "claude-opus-5-5",
    content: answer.content,
    stop_reason: answer.stopReason,
    stop_details: answer.stopReason === "refusal" ? { type: "refusal", category: null } : null,
    usage: { ...FAKE_USAGE, ...answer.usage },
  };
}

export class FakeAnthropic {
  readonly beta = { messages: { create: (body: unknown) => next("messages", body) } };
  readonly models = { list: (query: unknown) => next("models", query) };

  constructor(options: Record<string, unknown>) {
    clients.push(options);
  }
}

/** Queues an answer. Held, it waits until the returned function is called. */
function add(answer: Answer, held = false): () => void {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.push({ answer, gate });
  if (!held) {
    release();
  }
  return release;
}

export const claudeFake = {
  reset() {
    queue.length = 0;
    clients.length = 0;
    requests.length = 0;
  },
  /** The key check passes. */
  acceptKey() {
    add({ kind: "models" });
  },
  /**
   * Claude answers with this text, after a thinking block in the API's own shape. `model` is the
   * model that answered, as the API reports it, and `usage` changes the token counts it reports.
   */
  reply(
    text: string,
    stopReason = "end_turn",
    model?: string,
    usage?: Partial<Record<keyof FakeUsage, number | null>>,
  ) {
    add({
      kind: "message",
      content: [
        { type: "thinking", thinking: "", signature: "sig_fake" } as never,
        { type: "text", text },
      ],
      stopReason,
      model,
      usage,
    });
  },
  /** Claude answers with exactly these content blocks. */
  blocks(content: { type: string; text?: string }[]) {
    add({ kind: "message", content, stopReason: "end_turn" });
  },
  /** Claude answers a draft with this value, written as JSON. */
  draft(value: unknown) {
    this.reply(JSON.stringify(value));
  },
  /** A safety classifier declines, with nothing written. */
  refuse() {
    add({ kind: "message", content: [], stopReason: "refusal" });
  },
  /** The next call throws this. */
  fail(error: unknown) {
    add({ kind: "error", error });
  },
  /** The next call answers with this text only when the returned function is called. */
  hold(text: string): () => void {
    return add(
      { kind: "message", content: [{ type: "text", text }], stopReason: "end_turn" },
      true,
    );
  },
  /** The next call throws this only when the returned function is called. */
  holdFailure(error: unknown): () => void {
    return add({ kind: "error", error }, true);
  },
  get pending() {
    return queue.length;
  },
  clients,
  requests,
};
