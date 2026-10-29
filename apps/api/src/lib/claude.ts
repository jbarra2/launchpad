import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  CLAUDE_MODEL,
  partBody,
  partDraft,
  stripInvisible,
  type MessageRole,
  type PartDraft,
  type PartKind,
} from "@launchpad/shared";
import { env } from "../config/env.js";
import { draftInstruction, SYSTEM_PROMPT } from "./prompts.js";

// Every Claude call goes through here. Each call makes a new client that holds only the person's
// own key, and nothing keeps the key or the client after the call. The SDK is told to log nothing.

const DEFAULT_BASE_URL = "https://api.anthropic.com";
// Re-runs a request that a safety classifier declines on the model Anthropic recommends for it.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// Sent with a structured draft, as the SDK's own parse() sends it.
const STRUCTURED_OUTPUT_BETA = "structured-outputs-2025-12-15";
const REPLY_MAX_TOKENS = 4000;
const DRAFT_MAX_TOKENS = 16000;
const KEY_CHECK_TIMEOUT_MS = 15_000;
/** The longest reply that fits in a stored message. */
export const REPLY_MAX_CHARS = 4000;

export interface Usage {
  /** The model that answered, which the refusal fallback can change. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Turn {
  role: MessageRole;
  text: string;
}

/** What a call came back with. A refusal and an unusable answer still used tokens. */
export type ClaudeResult<T> =
  | { kind: "ok"; value: T; usage: Usage }
  | { kind: "refused"; usage: Usage }
  | { kind: "unusable"; usage: Usage };

export interface Claude {
  /** Asks Anthropic whether the key works. Listing models costs no tokens. */
  checkKey(): Promise<void>;
  /** Claude's next message in the interview. */
  reply(context: string, transcript: readonly Turn[]): Promise<ClaudeResult<string>>;
  /** A draft of the part, checked against the same rules as a part written by hand. */
  draft(
    context: string,
    transcript: readonly Turn[],
    part: PartKind,
  ): Promise<ClaudeResult<PartDraft>>;
}

// Passing the key means the SDK reads no other credential from the environment. There are no
// retries: the web app's proxy waits only 30 seconds longer than one call, and a person can send
// again with one tap.
function clientFor(apiKey: string, timeout: number) {
  return new Anthropic({
    apiKey,
    baseURL: env.ANTHROPIC_BASE_URL ?? DEFAULT_BASE_URL,
    timeout,
    maxRetries: 0,
    logLevel: "off",
  });
}

// The frozen system prompt first, cached, then the idea so far, then the conversation.
function request(context: string, transcript: readonly Turn[]) {
  return {
    model: CLAUDE_MODEL,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    cache_control: { type: "ephemeral" as const },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user" as const, content: context },
      ...transcript.map((turn) => ({ role: turn.role, content: turn.text })),
    ],
  };
}

interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function usageOf(model: string, usage: ApiUsage): Usage {
  return {
    model: model.slice(0, 64),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

// A point Claude starts with a bullet anyway loses the bullet, since the list shows its own.
const BULLET = /^\s*[-*•]\s+/;

/** The draft, if it is one: the right shape, and within the limits once invisible text is out. */
function parseDraft(text: string): PartDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const shape = partDraft.safeParse(raw);
  if (!shape.success) {
    return null;
  }
  const checked = partBody.safeParse({
    summary: stripInvisible(shape.data.summary),
    points: shape.data.points.map((point) => stripInvisible(point).replace(BULLET, "")),
  });
  return checked.success ? { summary: checked.data.summary, points: checked.data.points } : null;
}

export function makeClaude(apiKey: string): Claude {
  return {
    async checkKey() {
      await clientFor(apiKey, KEY_CHECK_TIMEOUT_MS).models.list({ limit: 1 });
    },

    async reply(context, transcript) {
      const response = await clientFor(apiKey, env.ANTHROPIC_TIMEOUT_MS).beta.messages.create({
        ...request(context, transcript),
        max_tokens: REPLY_MAX_TOKENS,
        output_config: { effort: "low" },
      });
      const usage = usageOf(response.model, response.usage);
      // A refusal can come after some text, which is not Claude's answer, so it is checked first.
      if (response.stop_reason === "refusal") {
        return { kind: "refused", usage };
      }
      const text = textOf(response.content).trim();
      // A reply cut off at the token cap would be kept as if it were whole.
      if (response.stop_reason === "max_tokens" || !text || text.length > REPLY_MAX_CHARS) {
        return { kind: "unusable", usage };
      }
      return { kind: "ok", value: text, usage };
    },

    async draft(context, transcript, part) {
      const response = await clientFor(apiKey, env.ANTHROPIC_TIMEOUT_MS).beta.messages.create({
        ...request(context, [...transcript, { role: "user", text: draftInstruction(part) }]),
        betas: [FALLBACK_BETA, STRUCTURED_OUTPUT_BETA],
        max_tokens: DRAFT_MAX_TOKENS,
        output_config: { effort: "medium", format: betaZodOutputFormat(partDraft) },
      });
      const usage = usageOf(response.model, response.usage);
      if (response.stop_reason === "refusal") {
        return { kind: "refused", usage };
      }
      const draft = parseDraft(textOf(response.content));
      return draft ? { kind: "ok", value: draft, usage } : { kind: "unusable", usage };
    },
  };
}
