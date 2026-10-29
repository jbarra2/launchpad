import { z } from "zod";
import { multiLineText, PART_KINDS, rocketIdParam, sessionIdParam } from "./rockets.js";

// The contract for a person's saved Claude key and for the chat sessions that build a part. No
// schema here has a field for the key itself: a saved key is only ever shown by its last 4
// characters, so it cannot leave through a response that is parsed with one of these.

/** The one model the chat uses. A model picker is a later phase. */
export const CLAUDE_MODEL = "claude-opus-5-5";
export const CLAUDE_MODEL_NAME = "Claude Opus 5.5";

/** The longest key accepted. Claude keys are about half this. */
export const API_KEY_MAX = 200;
/** How many times a person may have a key checked in an hour, saved or not. */
export const KEY_CHECKS_PER_HOUR = 10;

/** A chat message a person writes. */
export const MESSAGE_MAX = 2000;
/** The most answers one session holds. */
export const SESSION_MESSAGE_LIMIT = 30;
/** The most Claude calls one person may make in an hour, across every session. */
export const CLAUDE_CALLS_PER_HOUR = 60;

// A key is one unbroken word, so a space, a line break, or anything outside the letters Anthropic
// uses means something else was pasted with it.
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]+$/;

export const apiKeyBody = z.strictObject({
  key: z
    .string({ error: "Paste your Claude key." })
    .trim()
    .min(1, "Paste your Claude key.")
    .max(API_KEY_MAX, "That is longer than a Claude key. Check what you pasted.")
    .regex(KEY_SHAPE, "A Claude key starts with sk-ant- and has no spaces. Check what you pasted."),
});

export type ApiKeyBody = z.infer<typeof apiKeyBody>;

const isoTime = z.iso.datetime();

export const API_KEY_STATUSES = ["valid", "invalid"] as const;

/** What a page may know about a saved key: whether there is one, whether it works, its end. */
export const savedApiKey = z.object({
  status: z.enum(API_KEY_STATUSES),
  last4: z.string().regex(/^[A-Za-z0-9_-]{4}$/),
  checkedAt: isoTime,
});

export const apiKeyState = z.union([z.object({ status: z.literal("none") }), savedApiKey]);

export type SavedApiKey = z.infer<typeof savedApiKey>;
export type ApiKeyState = z.infer<typeof apiKeyState>;

export const SESSION_STATUSES = ["open", "closed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const messageBody = z.strictObject({
  text: multiLineText("message", MESSAGE_MAX, "Write a message first."),
});

export type MessageBody = z.infer<typeof messageBody>;

export const chatMessage = z.object({
  id: z.string(),
  role: z.enum(MESSAGE_ROLES),
  text: z.string(),
  createdAt: isoTime,
});

export const chatSession = z.object({
  id: sessionIdParam,
  rocketId: rocketIdParam,
  part: z.enum(PART_KINDS),
  status: z.enum(SESSION_STATUSES),
  /** Oldest first. A new session's first message is Claude's opening question. */
  messages: z.array(chatMessage),
});

/** The answer to a message: the person's message as it was stored, then Claude's reply. */
export const sentMessages = z.object({
  messages: z.array(chatMessage),
});

/**
 * The draft Claude writes for a part. It is never saved by the call that makes it: the person
 * edits it and attaches it like a part written by hand, and it is checked against the same rules.
 */
export const partDraft = z.object({
  summary: z.string(),
  points: z.array(z.string()),
});

export type ChatMessage = z.infer<typeof chatMessage>;
export type ChatSession = z.infer<typeof chatSession>;
export type SentMessages = z.infer<typeof sentMessages>;
export type PartDraft = z.infer<typeof partDraft>;
