import {
  CLAUDE_CALLS_PER_HOUR,
  PART_KINDS,
  SESSION_MESSAGE_LIMIT,
  type ChatSession,
  type PartKind,
  type RocketDetail,
} from "@launchpad/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_KEY, UNREADABLE } from "../src/lib/api-keys.js";
import {
  CLAUDE_BUSY,
  KEY_NOT_ALLOWED,
  KEY_REJECTED,
  OUT_OF_CREDIT,
  RATE_LIMITED,
} from "../src/lib/claude-errors.js";
import { prisma } from "../src/lib/prisma.js";
import { draftInstruction } from "../src/lib/prompts.js";
import {
  CLAUDE_DECLINED,
  DRAFT_UNUSABLE,
  NEEDS_AN_ANSWER,
  REPLY_UNUSABLE,
  REPLY_IN_FLIGHT,
  OPENER_IN_FLIGHT,
  SESSION_CLOSED,
  SESSION_FULL,
  SESSION_OTHER_PART,
  TOO_MANY_CALLS,
} from "../src/lib/sessions.js";
import { createVerifiedUser, del, get, PASSWORD, post, put } from "./helpers/auth.js";
import { PLANTED, sdkError, timeoutError } from "./helpers/claude-errors.js";
import { claudeFake, FAKE_USAGE } from "./helpers/claude-fake.js";
import { backendOf, lockWaitOrAnswer } from "./helpers/locks.js";

// Chat sessions: opening one for the next part, the interview, the draft, ending it, and attaching
// the part it built. Claude is the stand-in from tests/helpers/claude-fake.ts. Made-up keys only.

const KEY = "sk-ant-good-1234";
const idea = {
  name: "Recipe Swap",
  pitch: "Trade family recipes with people you trust.",
  why: "Grandma's cards are fading.",
};
const OPENER = "Hi! Who would use Recipe Swap first?";
const LAUNCHED = "This idea has launched, so it can no longer change.";
const SESSION_GONE = "That chat session was not found.";
const DRAFT = { summary: "Cousins who share recipes as photos.", points: ["Photos get lost"] };

afterEach(() => {
  vi.restoreAllMocks();
});

async function personWithKey(email: string) {
  const person = await createVerifiedUser(email);
  claudeFake.acceptKey();
  expect((await put("/api/me/api-key", { key: KEY }, { cookie: person.cookie })).status).toBe(200);
  claudeFake.reset();
  return person;
}

async function createRocket(cookie: string) {
  const response = await post("/api/rockets", idea, { cookie });
  expect(response.status).toBe(201);
  return response.body as RocketDetail;
}

async function addParts(cookie: string, id: string, last: PartKind) {
  for (const kind of PART_KINDS.slice(1, PART_KINDS.indexOf(last) + 1)) {
    const body = { summary: `The ${kind} summary.`, points: [] };
    expect((await put(`/api/rockets/${id}/parts/${kind}`, body, { cookie })).status).toBe(200);
  }
}

async function startSession(cookie: string, rocketId: string) {
  claudeFake.reply(OPENER);
  const response = await post(`/api/rockets/${rocketId}/sessions`, {}, { cookie });
  expect(response.status).toBe(201);
  return response.body as ChatSession;
}

/** A person with a key, an idea, and an open session with Claude's first question. */
async function openSession(email = "ana@example.com") {
  const person = await personWithKey(email);
  const rocket = await createRocket(person.cookie);
  const session = await startSession(person.cookie, rocket.id);
  return { ...person, rocket, session };
}

async function send(cookie: string, sessionId: string, text: string) {
  return post(`/api/sessions/${sessionId}/messages`, { text }, { cookie });
}

const messagesIn = (sessionId: string) => prisma.chatMessage.count({ where: { sessionId } });
const sessionRow = (id: string) => prisma.chatSession.findUniqueOrThrow({ where: { id } });

interface SentRequest {
  messages: { role: string; content: string }[];
}
const sentMessages = (index = -1) => (claudeFake.requests.at(index)?.body as SentRequest).messages;

describe("starting a session", () => {
  it("opens one for the next part, and Claude asks the first question", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    claudeFake.reply(OPENER);
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      rocketId: rocket.id,
      part: "fuel",
      status: "open",
      messages: [
        { id: expect.any(String), role: "assistant", text: OPENER, createdAt: expect.any(String) },
      ],
    });
    const [context] = sentMessages();
    expect(context?.role).toBe("user");
    expect(context?.content).toContain("# Recipe Swap");
    expect(context?.content).toContain("This session builds the Fuel tank");
    expect(claudeFake.clients.at(-1)).toMatchObject({ apiKey: KEY });

    const usage = await prisma.usageEvent.findMany();
    expect(usage).toEqual([
      expect.objectContaining({
        userId: ana.userId,
        rocketId: rocket.id,
        kind: "INTERVIEW",
        model: "claude-opus-5-5",
        inputTokens: FAKE_USAGE.input_tokens,
        outputTokens: FAKE_USAGE.output_tokens,
        cacheReadTokens: FAKE_USAGE.cache_read_input_tokens,
        cacheWriteTokens: FAKE_USAGE.cache_creation_input_tokens,
      }),
    ]);
    const detail = await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
    expect(detail.body.openSession).toEqual({ id: response.body.id, part: "fuel" });
  });

  it("answers with the session already open instead of opening a second", async () => {
    const { cookie, rocket, session } = await openSession();
    const again = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(session.id);
    expect(await prisma.chatSession.count()).toBe(1);
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("asks for the first question again when the last try failed", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    claudeFake.fail(sdkError(529, "overloaded_error"));
    const failed = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ error: CLAUDE_BUSY });
    claudeFake.reply(OPENER);
    const retried = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(retried.status).toBe(200);
    expect(retried.body.messages.map((m: { text: string }) => m.text)).toEqual([OPENER]);
    expect(await prisma.chatSession.count()).toBe(1);
  });

  it("tells a second Start that the first question is on its way, and opens one session", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const release = claudeFake.hold(OPENER);
    const first = post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie }).then(
      (r) => r,
    );
    await vi.waitUntil(() => claudeFake.requests.length === 1, { timeout: 10_000 });
    const second = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: OPENER_IN_FLIGHT });
    release();
    expect((await first).status).toBe(201);
    expect(await prisma.chatSession.count()).toBe(1);
  });

  it("asks for no second opener when the first arrived while it waited for the claim", async () => {
    const { cookie, rocket, session } = await openSession();
    const original = prisma.chatSession.findFirst.bind(prisma.chatSession);
    // This request read the session before the first question was saved.
    vi.spyOn(prisma.chatSession, "findFirst").mockImplementationOnce((async (
      args: Parameters<typeof original>[0],
    ) => ({ ...(await original(args)), messages: [] })) as never);
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie });
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(session.id);
    expect(claudeFake.requests).toHaveLength(1);
    expect(await messagesIn(session.id)).toBe(1);
  });

  it("needs a saved key, and opens nothing without one", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: NO_KEY });
    expect(await prisma.chatSession.count()).toBe(0);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("is refused for a key Anthropic stopped accepting, without asking again", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await prisma.apiCredential.updateMany({ data: { status: "INVALID" } });
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: KEY_REJECTED });
    expect(claudeFake.requests).toHaveLength(0);
    expect(await prisma.chatSession.count()).toBe(0);
  });

  it("is refused for a launched idea, and for one with all six parts on", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "nose");
    const full = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(full.status).toBe(409);
    expect(
      (await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie })).status,
    ).toBe(200);
    const launched = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(launched.status).toBe(409);
    expect(launched.body).toEqual({ error: LAUNCHED });
    expect(await prisma.chatSession.count()).toBe(0);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("is a 404 for another person's idea, and opens nothing", async () => {
    const ana = await personWithKey("ana@example.com");
    const ben = await personWithKey("ben@example.com");
    const bens = await createRocket(ben.cookie);
    const response = await post(`/api/rockets/${bens.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(404);
    expect(await prisma.chatSession.count()).toBe(0);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("is refused for a key saved under another key version, before anything opens", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await prisma.apiCredential.updateMany({ data: { keyVersion: 2 } });
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: UNREADABLE });
    expect(await prisma.chatSession.count()).toBe(0);
    expect(claudeFake.requests).toHaveLength(0);
  });

  it("marks a saved key that cannot be opened as no longer working", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const row = await prisma.apiCredential.findFirstOrThrow();
    const changed = Uint8Array.from(row.ciphertext);
    changed[0] = (changed[0] ?? 0) ^ 1;
    await prisma.apiCredential.updateMany({ data: { ciphertext: changed } });
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: UNREADABLE });
    expect(claudeFake.requests).toHaveLength(0);
    expect((await get("/api/me", { cookie: ana.cookie })).body.apiKey.status).toBe("invalid");
  });

  it("leaves a key saved meanwhile alone when the old one is refused", async () => {
    const { cookie, session } = await openSession();
    const release = claudeFake.holdFailure(sdkError(401, "authentication_error"));
    const pending = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    claudeFake.acceptKey();
    expect((await put("/api/me/api-key", { key: "sk-ant-next-9876" }, { cookie })).status).toBe(
      200,
    );
    release();
    expect((await pending).status).toBe(400);
    expect((await prisma.apiCredential.findFirstOrThrow()).status).toBe("VALID");
  });

  it("marks the key invalid when Anthropic stops accepting it", async () => {
    const ana = await personWithKey("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    claudeFake.fail(sdkError(401, "authentication_error"));
    const response = await post(`/api/rockets/${rocket.id}/sessions`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: KEY_REJECTED });
    expect((await prisma.apiCredential.findFirstOrThrow()).status).toBe("INVALID");
    expect((await get("/api/me", { cookie: ana.cookie })).body.apiKey.status).toBe("invalid");
  });
});

describe("sending a message", () => {
  it("saves it with Claude's reply, and sends Claude the idea and the whole conversation", async () => {
    const { cookie, session } = await openSession();
    claudeFake.reply("How do they share recipes today?");
    const response = await send(cookie, session.id, "  My cousins.  ");
    expect(response.status).toBe(200);
    expect(response.body.messages).toEqual([
      expect.objectContaining({ role: "user", text: "My cousins." }),
      expect.objectContaining({ role: "assistant", text: "How do they share recipes today?" }),
    ]);
    expect(sentMessages()[0]?.content).toContain("# Recipe Swap");
    expect(sentMessages()[0]?.content).toContain("This session builds the Fuel tank");
    // The Engine's first point, which only the parts carry.
    expect(sentMessages()[0]?.content).toContain("- Grandma's cards are fading.");
    expect(sentMessages().slice(1)).toEqual([
      { role: "assistant", content: OPENER },
      { role: "user", content: "My cousins." },
    ]);
    const stored = await get(`/api/sessions/${session.id}`, { cookie });
    expect(stored.body.messages.map((m: { text: string }) => m.text)).toEqual([
      OPENER,
      "My cousins.",
      "How do they share recipes today?",
    ]);
    expect(await prisma.usageEvent.count({ where: { kind: "INTERVIEW" } })).toBe(2);
  });

  it("is refused while Claude is still answering the last one", async () => {
    const { cookie, session } = await openSession();
    const release = claudeFake.hold("Second question?");
    const first = send(cookie, session.id, "First answer.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    const second = await send(cookie, session.id, "Second answer.");
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: REPLY_IN_FLIGHT });
    release();
    expect((await first).status).toBe(200);
    expect(await messagesIn(session.id)).toBe(3);
  });

  it("keeps nothing from a call whose claim ran out and was taken by a newer request", async () => {
    const { cookie, session } = await openSession();
    const release = claudeFake.hold("Too late.");
    const pending = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    const newer = new Date(Date.now() + 1000);
    await prisma.chatSession.update({ where: { id: session.id }, data: { replyStartedAt: newer } });
    release();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: REPLY_IN_FLIGHT });
    expect(await messagesIn(session.id)).toBe(1);
    expect((await sessionRow(session.id)).replyStartedAt).toEqual(newer);
  });

  it("records the model that answered", async () => {
    const { cookie, session } = await openSession();
    claudeFake.reply("Next?", "end_turn", "claude-opus-4-8");
    expect((await send(cookie, session.id, "My cousins.")).status).toBe(200);
    const usage = await prisma.usageEvent.findMany();
    expect(usage.map((event) => event.model).sort()).toEqual([
      "claude-opus-4-8",
      "claude-opus-5-5",
    ]);
  });

  it("still refuses while a reply in flight is late but not yet twice the time allowed", async () => {
    const { cookie, session } = await openSession();
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { replyStartedAt: new Date(Date.now() - 90_000 - 1000) },
    });
    const response = await send(cookie, session.id, "Answer.");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: REPLY_IN_FLIGHT });
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("is let through once a reply in flight is long overdue, so a crash cannot lock the session", async () => {
    const { cookie, session } = await openSession();
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { replyStartedAt: new Date(Date.now() - 2 * 90_000 - 1000) },
    });
    claudeFake.reply("Next?");
    expect((await send(cookie, session.id, "Answer.")).status).toBe(200);
    expect((await sessionRow(session.id)).replyStartedAt).toBeNull();
  });

  it("takes the 30th answer, then refuses the 31st before Claude is asked", async () => {
    const { cookie, session } = await openSession();
    await prisma.chatMessage.createMany({
      data: Array.from({ length: SESSION_MESSAGE_LIMIT - 1 }, (_, i) => ({
        sessionId: session.id,
        role: "USER" as const,
        content: `Answer ${i}`,
      })),
    });
    claudeFake.reply("Last question?");
    expect((await send(cookie, session.id, "The 30th answer.")).status).toBe(200);
    const response = await send(cookie, session.id, "One more.");
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: SESSION_FULL });
    expect(claudeFake.requests).toHaveLength(2);
    expect((await sessionRow(session.id)).replyStartedAt).toBeNull();
  });

  it("is refused after 60 Claude calls in an hour, even when two arrive at once", async () => {
    const ana = await personWithKey("ana@example.com");
    const first = await createRocket(ana.cookie);
    const second = await createRocket(ana.cookie);
    const one = await startSession(ana.cookie, first.id);
    const two = await startSession(ana.cookie, second.id);
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR - 3 }, () => ({
        userId: ana.userId,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
      })),
    });
    claudeFake.reply("Reply.");
    claudeFake.reply("Reply.");
    const answers = await Promise.all([
      send(ana.cookie, one.id, "Answer one."),
      send(ana.cookie, two.id, "Answer two."),
    ]);
    // Two sessions, one claim each: the second call to take the person's row finds the cap full.
    expect(answers.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(answers.find((r) => r.status === 429)?.body).toEqual({ error: TOO_MANY_CALLS });
    expect(await prisma.usageEvent.count()).toBe(CLAUDE_CALLS_PER_HOUR);
    expect(claudeFake.requests).toHaveLength(3);
  });

  it("makes a call wait for one already counting, so the hourly cap holds when two arrive at once", async () => {
    const { cookie, userId, session } = await openSession();
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR - 2 }, () => ({
        userId,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
      })),
    });
    let answered = false;
    let pending: Promise<{ status: number; body: unknown }> | undefined;
    await prisma.$transaction(
      async (tx) => {
        // Another call, part way through: it holds the person's row and has written the 60th row.
        await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${userId} FOR SHARE`;
        await tx.usageEvent.create({
          data: { userId, kind: "INTERVIEW", model: "claude-opus-5-5" },
        });
        const holder = await backendOf(tx);
        pending = send(cookie, session.id, "My cousins.").then((r) => {
          answered = true;
          return r;
        });
        await lockWaitOrAnswer(() => answered, { blockedBy: holder });
        // Without the lock it would have counted 59 and called Claude.
        expect(answered).toBe(false);
      },
      { timeout: 15_000 },
    );
    const response = await pending;
    expect(response?.status).toBe(429);
    expect(response?.body).toEqual({ error: TOO_MANY_CALLS });
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("counts every call from the last hour, not only the last few minutes", async () => {
    const { cookie, userId, session } = await openSession();
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR }, () => ({
        userId,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
        createdAt: new Date(Date.now() - 59 * 60 * 1000),
      })),
    });
    const response = await send(cookie, session.id, "Answer.");
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: TOO_MANY_CALLS });
  });

  it("counts only the last hour of calls", async () => {
    const { cookie, userId, session } = await openSession();
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR }, () => ({
        userId,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
        createdAt: new Date(Date.now() - 61 * 60 * 1000),
      })),
    });
    claudeFake.reply("Next?");
    expect((await send(cookie, session.id, "Answer.")).status).toBe(200);
  });

  it.each([
    ["an account out of credit", sdkError(402, "billing_error"), 402, OUT_OF_CREDIT],
    ["a key Anthropic is limiting", sdkError(429, "rate_limit_error"), 429, RATE_LIMITED],
    ["Anthropic overloaded", sdkError(529, "overloaded_error"), 503, CLAUDE_BUSY],
    ["a call that timed out", timeoutError(), 504, "Claude took too long; try again."],
  ])(
    "saves nothing on %s, says so, and lets the next message through",
    async (_n, error, status, message) => {
      const { cookie, session } = await openSession();
      claudeFake.fail(error);
      const failed = await send(cookie, session.id, "My cousins.");
      expect(failed.status).toBe(status);
      expect(failed.body).toEqual({ error: message });
      expect(failed.text).not.toContain(PLANTED);
      expect(await messagesIn(session.id)).toBe(1);
      claudeFake.reply("Next?");
      expect((await send(cookie, session.id, "My cousins.")).status).toBe(200);
    },
  );

  it("leaves the key valid when Anthropic only refuses it this model", async () => {
    const { cookie, session } = await openSession();
    claudeFake.fail(sdkError(403, "permission_error"));
    const response = await send(cookie, session.id, "My cousins.");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: KEY_NOT_ALLOWED });
    expect((await get("/api/me", { cookie })).body.apiKey.status).toBe("valid");
  });

  it("saves nothing when the reply cannot be used, and counts its tokens", async () => {
    const { cookie, session } = await openSession();
    claudeFake.reply("Who would use it first, and", "max_tokens");
    const response = await send(cookie, session.id, "My cousins.");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: REPLY_UNUSABLE });
    expect(await messagesIn(session.id)).toBe(1);
    const usage = await prisma.usageEvent.findMany();
    expect(usage).toHaveLength(2);
    expect(usage.every((event) => event.outputTokens === FAKE_USAGE.output_tokens)).toBe(true);
  });

  it("saves nothing when Claude declines, and counts the tokens the refusal used", async () => {
    const { cookie, session } = await openSession();
    claudeFake.refuse();
    const response = await send(cookie, session.id, "Something Claude declines.");
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: CLAUDE_DECLINED });
    expect(await messagesIn(session.id)).toBe(1);
    const usage = await prisma.usageEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(usage).toHaveLength(2);
    expect(usage[1]).toMatchObject({
      inputTokens: FAKE_USAGE.input_tokens,
      outputTokens: FAKE_USAGE.output_tokens,
      cacheReadTokens: FAKE_USAGE.cache_read_input_tokens,
      cacheWriteTokens: FAKE_USAGE.cache_creation_input_tokens,
    });
  });

  it("refuses a message that breaks the rules, before Claude is asked", async () => {
    const { cookie, session } = await openSession();
    for (const body of [
      {},
      { text: "" },
      { text: "m".repeat(2001) },
      { text: `a${String.fromCodePoint(0x202e)}b` },
      { text: "hi", role: "assistant" },
    ]) {
      const response = await post(`/api/sessions/${session.id}/messages`, body, { cookie });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("is refused once the session has ended", async () => {
    const { cookie, session } = await openSession();
    expect((await post(`/api/sessions/${session.id}/close`, {}, { cookie })).status).toBe(204);
    const response = await send(cookie, session.id, "Hello?");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: SESSION_CLOSED });
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("is refused on a launched idea, even if a session were left open", async () => {
    const { cookie, rocket, session } = await openSession();
    await prisma.rocket.update({
      where: { id: rocket.id },
      data: { status: "LAUNCHED", launchedAt: new Date() },
    });
    for (const response of [
      await send(cookie, session.id, "Hello?"),
      await post(`/api/sessions/${session.id}/draft`, {}, { cookie }),
    ]) {
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: LAUNCHED });
    }
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("is refused once the key is removed", async () => {
    const { cookie, session } = await openSession();
    await del("/api/me/api-key", { cookie });
    const response = await send(cookie, session.id, "Hello?");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: NO_KEY });
    expect((await sessionRow(session.id)).replyStartedAt).toBeNull();
  });

  it("drops Claude's reply when the session ends while it is on its way", async () => {
    const { cookie, session } = await openSession();
    const release = claudeFake.hold("Too late.");
    const pending = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    expect((await post(`/api/sessions/${session.id}/close`, {}, { cookie })).status).toBe(204);
    release();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: SESSION_CLOSED });
    expect(await messagesIn(session.id)).toBe(1);
  });

  it("drops the reply into a session that closed without letting go of the claim", async () => {
    // Every way a session closes today also lets go of its claim. This guards the save if a later
    // one forgets: a closed session keeps nothing, whatever its claim says.
    const { cookie, session } = await openSession();
    const release = claudeFake.hold("Too late.");
    const pending = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    release();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: SESSION_CLOSED });
    expect(await messagesIn(session.id)).toBe(1);
  });

  it("leaves nothing behind when the idea is deleted while a reply is on its way", async () => {
    const { cookie, rocket, session } = await openSession();
    const release = claudeFake.hold("Too late.");
    const pending = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    expect((await del(`/api/rockets/${rocket.id}`, { cookie })).status).toBe(204);
    release();
    expect((await pending).status).toBe(404);
    expect(await prisma.chatSession.count()).toBe(0);
    expect(await prisma.chatMessage.count()).toBe(0);
    const usage = await prisma.usageEvent.findMany();
    expect(usage).toHaveLength(2);
    expect(usage.every((event) => event.rocketId === null)).toBe(true);
  });

  it("still counts the calls of a deleted idea, so deleting cannot reset the hourly cap", async () => {
    const { cookie, userId, rocket } = await openSession();
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR - 1 }, () => ({
        userId,
        rocketId: rocket.id,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
      })),
    });
    expect((await del(`/api/rockets/${rocket.id}`, { cookie })).status).toBe(204);
    const fresh = await createRocket(cookie);
    const response = await post(`/api/rockets/${fresh.id}/sessions`, {}, { cookie });
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: TOO_MANY_CALLS });
  });

  it("counts only the person's own calls", async () => {
    const { cookie, session } = await openSession();
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await prisma.usageEvent.createMany({
      data: Array.from({ length: CLAUDE_CALLS_PER_HOUR }, () => ({
        userId: ben.userId,
        kind: "INTERVIEW" as const,
        model: "claude-opus-5-5",
      })),
    });
    claudeFake.reply("Next?");
    expect((await send(cookie, session.id, "My cousins.")).status).toBe(200);
  });

  it("is refused on a key that stopped working while the session was open", async () => {
    const { cookie, session } = await openSession();
    const clientsBefore = claudeFake.clients.length;
    await prisma.apiCredential.updateMany({ data: { status: "INVALID" } });
    const rejected = await send(cookie, session.id, "My cousins.");
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({ error: KEY_REJECTED });
    await prisma.apiCredential.updateMany({ data: { status: "VALID", keyVersion: 2 } });
    const unreadable = await send(cookie, session.id, "My cousins.");
    expect(unreadable.status).toBe(400);
    expect(unreadable.body).toEqual({ error: UNREADABLE });
    expect(claudeFake.clients).toHaveLength(clientsBefore);
    expect((await sessionRow(session.id)).replyStartedAt).toBeNull();
  });

  it("keeps a newer request's claim when an older one finishes late", async () => {
    const { cookie, session } = await openSession();
    const releaseOld = claudeFake.hold("Too late.");
    const old = send(cookie, session.id, "First.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 2, { timeout: 10_000 });
    // The old claim runs out, and a newer request takes the session.
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { replyStartedAt: new Date(Date.now() - 3 * 90_000) },
    });
    const releaseNew = claudeFake.hold("On time.");
    const newer = send(cookie, session.id, "Second.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 3, { timeout: 10_000 });
    releaseOld();
    expect((await old).status).toBe(409);
    // The newer request still holds the session, so a third waits its turn.
    const third = await send(cookie, session.id, "Third.");
    expect(third.status).toBe(409);
    expect(third.body).toEqual({ error: REPLY_IN_FLIGHT });
    releaseNew();
    expect((await newer).status).toBe(200);
  });

  it("keeps a reply after its question when both were saved in the same moment", async () => {
    const { cookie, session } = await openSession();
    const at = new Date();
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "ASSISTANT", content: "The reply.", createdAt: at },
    });
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "USER", content: "The question.", createdAt: at },
    });
    const stored = await get(`/api/sessions/${session.id}`, { cookie });
    expect(stored.body.messages.slice(1).map((m: { text: string }) => m.text)).toEqual([
      "The question.",
      "The reply.",
    ]);
  });
});

describe("a draft", () => {
  it("is Claude's summary and points for the part, and nothing is saved", async () => {
    const { cookie, rocket, session } = await openSession();
    claudeFake.reply("Next?");
    await send(cookie, session.id, "My cousins share photos of recipes.");
    claudeFake.draft(DRAFT);
    const response = await post(`/api/sessions/${session.id}/draft`, {}, { cookie });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(DRAFT);
    expect(await prisma.part.count({ where: { rocketId: rocket.id } })).toBe(1);
    expect(await messagesIn(session.id)).toBe(3);
    expect(await prisma.usageEvent.count({ where: { kind: "DRAFT" } })).toBe(1);
    expect((await sessionRow(session.id)).status).toBe("OPEN");
    const sent = sentMessages();
    expect(sent[0]?.content).toContain("# Recipe Swap");
    expect(sent.slice(1)).toEqual([
      { role: "assistant", content: OPENER },
      { role: "user", content: "My cousins share photos of recipes." },
      { role: "assistant", content: "Next?" },
      { role: "user", content: draftInstruction("fuel") },
    ]);
  });

  it("is refused for a session that has ended, or while Claude is answering", async () => {
    const { cookie, session } = await openSession();
    claudeFake.reply("Next?");
    await send(cookie, session.id, "My cousins.");
    const release = claudeFake.hold("Another question?");
    const pending = send(cookie, session.id, "More.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 3, { timeout: 10_000 });
    const busy = await post(`/api/sessions/${session.id}/draft`, {}, { cookie });
    expect(busy.status).toBe(409);
    expect(busy.body).toEqual({ error: REPLY_IN_FLIGHT });
    release();
    await pending;
    await post(`/api/sessions/${session.id}/close`, {}, { cookie });
    const usageBefore = await prisma.usageEvent.count();
    const ended = await post(`/api/sessions/${session.id}/draft`, {}, { cookie });
    expect(ended.status).toBe(409);
    expect(ended.body).toEqual({ error: SESSION_CLOSED });
    expect(claudeFake.requests).toHaveLength(3);
    expect(await prisma.usageEvent.count()).toBe(usageBefore);
  });

  it("needs at least one answer first", async () => {
    const { cookie, session } = await openSession();
    const response = await post(`/api/sessions/${session.id}/draft`, {}, { cookie });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: NEEDS_AN_ANSWER });
    expect(claudeFake.requests).toHaveLength(1);
  });

  it("is a 503 when Claude's draft cannot be used, and a 422 when Claude declines", async () => {
    const { cookie, session } = await openSession();
    claudeFake.reply("Next?");
    await send(cookie, session.id, "My cousins.");
    claudeFake.draft({ summary: "s".repeat(700), points: [] });
    const unusable = await post(`/api/sessions/${session.id}/draft`, {}, { cookie });
    expect(unusable.status).toBe(503);
    expect(unusable.body).toEqual({ error: DRAFT_UNUSABLE });
    claudeFake.refuse();
    expect((await post(`/api/sessions/${session.id}/draft`, {}, { cookie })).status).toBe(422);
    expect(await prisma.part.count()).toBe(1);
  });
});

describe("another person's session", () => {
  it("is a 404 on every route, and nothing changes", async () => {
    const { session } = await openSession();
    const ben = await personWithKey("ben@example.com");
    const before = await prisma.chatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: true },
    });
    const callsBefore = claudeFake.requests.length;
    for (const response of [
      await get(`/api/sessions/${session.id}`, { cookie: ben.cookie }),
      await send(ben.cookie, session.id, "Hello"),
      await post(`/api/sessions/${session.id}/draft`, {}, { cookie: ben.cookie }),
      await post(`/api/sessions/${session.id}/close`, {}, { cookie: ben.cookie }),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: SESSION_GONE });
      expect(response.text).not.toContain(OPENER);
    }
    const after = await prisma.chatSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { messages: true },
    });
    expect(after).toEqual(before);
    expect(claudeFake.requests).toHaveLength(callsBefore);
  });

  it("is a 404 even while the owner's reply is on its way, so nobody learns it is busy", async () => {
    const { cookie, session } = await openSession();
    const ben = await personWithKey("ben@example.com");
    const release = claudeFake.hold("Next?");
    const anas = send(cookie, session.id, "My cousins.").then((r) => r);
    await vi.waitUntil(() => claudeFake.requests.length === 1, { timeout: 10_000 });
    const claimed = (await sessionRow(session.id)).replyStartedAt;
    for (const response of [
      await send(ben.cookie, session.id, "Hello"),
      await post(`/api/sessions/${session.id}/draft`, {}, { cookie: ben.cookie }),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: SESSION_GONE });
    }
    expect((await sessionRow(session.id)).replyStartedAt).toEqual(claimed);
    release();
    expect((await anas).status).toBe(200);
  });

  it("is a 404 for an id that could not name a session, before any query", async () => {
    const { cookie } = await openSession();
    const lookups = vi.spyOn(prisma.chatSession, "findFirst");
    for (const id of ["NOPE", "a.b", "x".repeat(41)]) {
      expect((await get(`/api/sessions/${id}`, { cookie })).status).toBe(404);
    }
    expect(lookups).not.toHaveBeenCalled();
    // An id in the right shape does reach the database, so the spy would have seen a query.
    expect((await get("/api/sessions/cnotarealsession0000000000", { cookie })).status).toBe(404);
    expect(lookups).toHaveBeenCalledTimes(1);
  });

  it("is refused from another site, and with no session, before anything is read", async () => {
    const { cookie, session } = await openSession();
    const foreign = { cookie, origin: "https://evil.example" };
    expect(
      (await post(`/api/sessions/${session.id}/messages`, { text: "x" }, foreign)).status,
    ).toBe(403);
    expect((await post(`/api/sessions/${session.id}/close`, {}, foreign)).status).toBe(403);
    expect((await get(`/api/sessions/${session.id}`)).status).toBe(401);
    expect((await sessionRow(session.id)).status).toBe("OPEN");
  });
});

describe("ending a session", () => {
  it("closes it, can be asked again, and lets a new one open", async () => {
    const { cookie, rocket, session } = await openSession();
    expect((await post(`/api/sessions/${session.id}/close`, {}, { cookie })).status).toBe(204);
    expect((await post(`/api/sessions/${session.id}/close`, {}, { cookie })).status).toBe(204);
    const row = await sessionRow(session.id);
    expect(row.status).toBe("CLOSED");
    expect(row.closedAt).not.toBeNull();
    expect((await get(`/api/rockets/${rocket.id}`, { cookie })).body.openSession).toBeNull();
    const closed = await get(`/api/sessions/${session.id}`, { cookie });
    expect(closed.body.status).toBe("closed");
    const next = await startSession(cookie, rocket.id);
    expect(next.id).not.toBe(session.id);
  });
});

describe("attaching the part a session built", () => {
  async function sessionWithDraft() {
    const opened = await openSession();
    claudeFake.reply("Next?");
    await send(opened.cookie, opened.session.id, "My cousins.");
    return opened;
  }

  it("writes the part from the chat and closes the session together", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    const response = await put(
      `/api/rockets/${rocket.id}/parts/fuel`,
      { ...DRAFT, sessionId: session.id },
      { cookie },
    );
    expect(response.status).toBe(200);
    expect(response.body.parts[1]).toMatchObject({ kind: "fuel", ...DRAFT, source: "chat" });
    expect(response.body.openSession).toBeNull();
    expect((await sessionRow(session.id)).status).toBe("CLOSED");
    const plan = await get(`/api/rockets/${rocket.id}/plan.md`, { cookie });
    expect(plan.text).toContain(DRAFT.summary);
  });

  it("is a 404 with another person's session, or a session from another of my ideas", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    const ben = await openSession("ben@example.com");
    const bens = await put(
      `/api/rockets/${rocket.id}/parts/fuel`,
      { ...DRAFT, sessionId: ben.session.id },
      { cookie },
    );
    expect(bens.status).toBe(404);
    const other = await createRocket(cookie);
    const elsewhere = await put(
      `/api/rockets/${other.id}/parts/fuel`,
      { ...DRAFT, sessionId: session.id },
      { cookie },
    );
    expect(elsewhere.status).toBe(404);
    expect(await prisma.part.count({ where: { kind: "FUEL" } })).toBe(0);
    expect((await sessionRow(session.id)).status).toBe("OPEN");
    expect((await sessionRow(ben.session.id)).status).toBe("OPEN");
  });

  it("is refused with a session that has ended, or that built another part", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    const wrongPart = await put(
      `/api/rockets/${rocket.id}/parts/engine`,
      { ...DRAFT, sessionId: session.id },
      { cookie },
    );
    expect(wrongPart.status).toBe(409);
    expect(wrongPart.body).toEqual({ error: SESSION_OTHER_PART });
    await post(`/api/sessions/${session.id}/close`, {}, { cookie });
    const ended = await put(
      `/api/rockets/${rocket.id}/parts/fuel`,
      { ...DRAFT, sessionId: session.id },
      { cookie },
    );
    expect(ended.status).toBe(409);
    expect(ended.body).toEqual({ error: SESSION_CLOSED });
    expect(await prisma.part.count({ where: { kind: "FUEL" } })).toBe(0);
  });

  it("is refused with a session that ended while another is open for the part", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    await post(`/api/sessions/${session.id}/close`, {}, { cookie });
    const next = await startSession(cookie, rocket.id);
    const response = await put(
      `/api/rockets/${rocket.id}/parts/fuel`,
      { ...DRAFT, sessionId: session.id },
      { cookie },
    );
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: SESSION_CLOSED });
    expect((await sessionRow(next.id)).status).toBe("OPEN");
    expect(await prisma.part.count({ where: { kind: "FUEL" } })).toBe(0);
  });

  it("leaves the session open when the part cannot be written", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Part" DROP CONSTRAINT IF EXISTS "test_refuse_boom"`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Part" ADD CONSTRAINT "test_refuse_boom" CHECK ("summary" <> 'boom')`,
    );
    try {
      const response = await put(
        `/api/rockets/${rocket.id}/parts/fuel`,
        { summary: "boom", points: [], sessionId: session.id },
        { cookie },
      );
      expect(response.status).toBe(400);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Part" DROP CONSTRAINT "test_refuse_boom"`);
    }
    expect((await sessionRow(session.id)).status).toBe("OPEN");
    expect(await prisma.part.count({ where: { kind: "FUEL" } })).toBe(0);
  });

  it("leaves the part unwritten when the session cannot be closed", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "ChatSession" DROP CONSTRAINT IF EXISTS "test_refuse_close"`,
    );
    // Only a session marked for this test is refused, so one left behind by a stopped run harms
    // nothing else.
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { model: "test-refuse-close" },
    });
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "ChatSession" ADD CONSTRAINT "test_refuse_close" CHECK ("status" = 'OPEN' OR "model" <> 'test-refuse-close')`,
    );
    try {
      const response = await put(
        `/api/rockets/${rocket.id}/parts/fuel`,
        { ...DRAFT, sessionId: session.id },
        { cookie },
      );
      expect(response.status).toBe(400);
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ChatSession" DROP CONSTRAINT "test_refuse_close"`,
      );
    }
    expect(await prisma.part.count({ where: { kind: "FUEL" } })).toBe(0);
    expect((await sessionRow(session.id)).status).toBe("OPEN");
  });

  it("closes the open session when the person writes that part by hand instead", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    const response = await put(`/api/rockets/${rocket.id}/parts/fuel`, DRAFT, { cookie });
    expect(response.status).toBe(200);
    expect(response.body.parts[1]).toMatchObject({ kind: "fuel", source: "manual" });
    expect(response.body.openSession).toBeNull();
    expect((await sessionRow(session.id)).status).toBe("CLOSED");
  });

  it("leaves the open session alone when an earlier part is edited by hand", async () => {
    const { cookie, rocket, session } = await sessionWithDraft();
    const edit = { summary: "A new engine summary.", points: [] };
    const response = await put(`/api/rockets/${rocket.id}/parts/engine`, edit, { cookie });
    expect(response.status).toBe(200);
    expect(response.body.openSession).toEqual({ id: session.id, part: "fuel" });
    expect((await sessionRow(session.id)).status).toBe("OPEN");
  });
});

describe("deleting the account", () => {
  it("removes the key, sessions, messages, usage, and key checks, and leaves everyone else's", async () => {
    const ana = await openSession("ana@example.com");
    const ben = await openSession("ben@example.com");
    claudeFake.reply("Next?");
    await send(ana.cookie, ana.session.id, "My cousins.");
    const response = await post(
      "/api/auth/delete-user",
      { password: PASSWORD },
      { cookie: ana.cookie },
    );
    expect(response.status).toBe(200);
    expect(await prisma.apiCredential.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.keyCheck.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.usageEvent.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.chatSession.count({ where: { id: ana.session.id } })).toBe(0);
    expect(await prisma.chatMessage.count({ where: { sessionId: ana.session.id } })).toBe(0);
    expect(await prisma.apiCredential.count()).toBe(1);
    expect(await prisma.chatSession.count()).toBe(1);
    expect(await prisma.chatMessage.count({ where: { sessionId: ben.session.id } })).toBe(1);
    expect(await prisma.usageEvent.count()).toBe(1);
    expect(await prisma.keyCheck.count()).toBe(1);
  });
});

describe("the database itself", () => {
  async function refused(write: Promise<unknown>) {
    await expect(write).rejects.toThrow();
  }

  it("holds at most one open session per idea, whatever the code does", async () => {
    const { rocket } = await openSession();
    await refused(
      prisma.chatSession.create({
        data: { rocketId: rocket.id, part: "FUEL", model: "claude-opus-5-5" },
      }),
    );
    await prisma.chatSession.create({
      data: {
        rocketId: rocket.id,
        part: "FUEL",
        model: "claude-opus-5-5",
        status: "CLOSED",
        closedAt: new Date(),
      },
    });
    expect(await prisma.chatSession.count()).toBe(2);
  });

  it("closes a session exactly when it has a closing time", async () => {
    const { rocket, session } = await openSession();
    await refused(
      prisma.chatSession.update({ where: { id: session.id }, data: { status: "CLOSED" } }),
    );
    await refused(
      prisma.chatSession.update({ where: { id: session.id }, data: { closedAt: new Date() } }),
    );
    await refused(
      prisma.chatSession.create({
        data: { rocketId: rocket.id, part: "FUEL", model: "m", status: "CLOSED" },
      }),
    );
  });

  it("refuses an empty message, a saved key of the wrong shape, and negative tokens", async () => {
    const { userId, session } = await openSession();
    await refused(
      prisma.chatMessage.create({ data: { sessionId: session.id, role: "USER", content: "" } }),
    );
    const sealed = await prisma.apiCredential.findUniqueOrThrow({ where: { userId } });
    await refused(
      prisma.apiCredential.update({ where: { userId }, data: { iv: new Uint8Array(11) } }),
    );
    await refused(
      prisma.apiCredential.update({ where: { userId }, data: { tag: new Uint8Array(15) } }),
    );
    await refused(prisma.apiCredential.update({ where: { userId }, data: { last4: "abc" } }));
    await refused(prisma.apiCredential.update({ where: { userId }, data: { keyVersion: 0 } }));
    expect(await prisma.apiCredential.findUniqueOrThrow({ where: { userId } })).toEqual(sealed);
    await refused(
      prisma.usageEvent.create({
        data: { userId, kind: "INTERVIEW", model: "m", outputTokens: -1 },
      }),
    );
  });
});
