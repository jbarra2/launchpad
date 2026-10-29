import {
  CLAUDE_CALLS_PER_HOUR,
  CLAUDE_MODEL,
  SESSION_MESSAGE_LIMIT,
  type ChatMessage,
  type ChatSession,
} from "@launchpad/shared";
import { env } from "../config/env.js";
import {
  conflict,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unprocessable,
} from "../errors/http-error.js";
import type { MessageRole, Prisma, UsageKind } from "../generated/prisma/client.js";
import { withSavedKey } from "./api-keys.js";
import type { Claude, ClaudeResult, Turn, Usage } from "./claude.js";
import { anHourAgo, lockPerson } from "./person-lock.js";
import { prisma } from "./prisma.js";
import { rocketContext } from "./prompts.js";
import { fromDbKind, ROCKET_LAUNCHED } from "./rockets.js";

// Chat sessions, each building one part of one idea. Every read goes through `loadSession`, which
// takes the signed-in person's id and treats anyone else's session like one that does not exist.

export const SESSION_NOT_FOUND = "That chat session was not found.";
export const SESSION_CLOSED = "This session has ended. Start a new one from the idea's page.";
export const SESSION_OTHER_PART =
  "That session built a different part. Attach its draft to the part it was for.";
export const REPLY_IN_FLIGHT =
  "Claude is still answering your last message. Wait for it, then send again.";
export const SESSION_FULL = `This session has ${SESSION_MESSAGE_LIMIT} answers, the most it holds. Build the part now, or end the session and start a new one.`;
export const TOO_MANY_CALLS = `You have used Claude ${CLAUDE_CALLS_PER_HOUR} times in the last hour, the most allowed. Try again later.`;
export const OPENER_IN_FLIGHT =
  "Claude is already writing the first question. Open the session again in a moment.";
export const NEEDS_AN_ANSWER =
  "Answer at least one of Claude's questions before you build the part.";
export const CLAUDE_DECLINED = "Claude declined that; try rephrasing.";
export const REPLY_UNUSABLE = "Claude's reply could not be used. Try again.";
export const DRAFT_UNUSABLE = "Claude's draft could not be used. Try again.";

// A call that has not finished after twice the timeout has died with its process, so the session
// it held is let go. Without this, a crash mid-call would lock the session for good.
const claimExpiry = () => new Date(Date.now() - 2 * env.ANTHROPIC_TIMEOUT_MS);

const SESSION_WITH_ROCKET = {
  rocket: { include: { parts: { orderBy: { kind: "asc" } } } },
  // Oldest first. A reply saved in the same moment as its question comes after it.
  messages: { orderBy: [{ createdAt: "asc" }, { role: "asc" }] },
} satisfies Prisma.ChatSessionInclude;

/** The one rule for whose session it is: the person who owns its idea. */
export const ownSession = (userId: string, id: string) => ({ id, rocket: { userId } });

/** The session with its idea and messages, if it is this person's. Anything else is a 404. */
export async function loadSession(userId: string, id: string) {
  const session = await prisma.chatSession.findFirst({
    where: ownSession(userId, id),
    include: SESSION_WITH_ROCKET,
  });
  if (!session) {
    throw notFound(SESSION_NOT_FOUND);
  }
  return session;
}

type StoredSession = Awaited<ReturnType<typeof loadSession>>;

const fromDbRole = (role: MessageRole): Turn["role"] => (role === "USER" ? "user" : "assistant");

/** The shape the shared schema answers with. The route parses it before it leaves. */
export function toChatSession(session: StoredSession): ChatSession {
  return {
    id: session.id,
    rocketId: session.rocketId,
    part: fromDbKind(session.part),
    status: session.status === "OPEN" ? "open" : "closed",
    messages: session.messages.map(toChatMessage),
  };
}

/** The first user message of every call: the idea as it stands now, and the part to build. */
export function contextOf(session: StoredSession): string {
  const { rocket } = session;
  return rocketContext(
    {
      name: rocket.name,
      pitch: rocket.pitch,
      parts: rocket.parts.map((part) => ({
        kind: fromDbKind(part.kind),
        summary: part.summary,
        points: part.points,
      })),
    },
    fromDbKind(session.part),
  );
}

export function toChatMessage(message: StoredSession["messages"][number]): ChatMessage {
  return {
    id: message.id,
    role: fromDbRole(message.role),
    text: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * The light check before a call: the session is this person's (else 404), and its idea has not
 * launched. Writing a part closes its session, so a launched idea should never have one open; it is
 * checked anyway, because a launched idea must not change. A session that has ended is refused by
 * `claimReply`.
 */
export async function checkSessionForCall(userId: string, id: string): Promise<void> {
  const session = await prisma.chatSession.findFirst({
    where: ownSession(userId, id),
    select: { rocket: { select: { status: true } } },
  });
  if (!session) {
    throw notFound(SESSION_NOT_FOUND);
  }
  if (session.rocket.status === "LAUNCHED") {
    throw conflict(ROCKET_LAUNCHED);
  }
}

export function transcriptOf(session: StoredSession): Turn[] {
  return session.messages.map((message) => ({
    role: fromDbRole(message.role),
    text: message.content,
  }));
}

/**
 * Marks the session as waiting on Claude, or refuses: one call at a time per session. The check and
 * the mark are one statement, so two requests cannot both pass. Returns the mark, which `release`
 * needs, so a late request cannot let go of a newer one's claim.
 */
export async function claimReply(sessionId: string): Promise<Date> {
  const startedAt = new Date();
  const { count } = await prisma.chatSession.updateMany({
    where: {
      id: sessionId,
      status: "OPEN",
      OR: [{ replyStartedAt: null }, { replyStartedAt: { lt: claimExpiry() } }],
    },
    data: { replyStartedAt: startedAt },
  });
  if (count === 1) {
    return startedAt;
  }
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) {
    throw notFound(SESSION_NOT_FOUND);
  }
  throw conflict(session.status === "OPEN" ? REPLY_IN_FLIGHT : SESSION_CLOSED);
}

export async function releaseReply(sessionId: string, startedAt: Date): Promise<void> {
  await prisma.chatSession.updateMany({
    where: { id: sessionId, replyStartedAt: startedAt },
    data: { replyStartedAt: null },
  });
}

/**
 * Counts one Claude call against the person's hourly cap, or refuses it. The row is written before
 * the call goes out, so calls in flight count, and the person's own row is held while counting, so
 * calls at the same moment take turns and cannot pass the cap together.
 */
async function reserveCall(userId: string, rocketId: string, kind: UsageKind): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await lockPerson(tx, userId);
    const recent = await tx.usageEvent.count({
      where: { userId, createdAt: { gt: anHourAgo() } },
    });
    if (recent >= CLAUDE_CALLS_PER_HOUR) {
      throw tooManyRequests(TOO_MANY_CALLS);
    }
    const event = await tx.usageEvent.create({
      data: { userId, rocketId, kind, model: CLAUDE_MODEL },
      select: { id: true },
    });
    return event.id;
  });
}

async function recordUsage(eventId: string, usage: Usage): Promise<void> {
  await prisma.usageEvent.updateMany({ where: { id: eventId }, data: usage });
}

/**
 * One Claude call for a session, with the person's saved key: counted against the hourly cap, its
 * tokens recorded whatever it answered, and a refusal or an answer that cannot be used turned into
 * a sentence. The caller holds the session's claim.
 */
export async function callClaude<T>(
  session: StoredSession,
  kind: UsageKind,
  call: (claude: Claude) => Promise<ClaudeResult<T>>,
): Promise<T> {
  const result = await withSavedKey(session.rocket.userId, async (claude) => {
    const eventId = await reserveCall(session.rocket.userId, session.rocketId, kind);
    const answer = await call(claude);
    await recordUsage(eventId, answer.usage);
    return answer;
  });
  if (result.kind === "refused") {
    throw unprocessable(CLAUDE_DECLINED);
  }
  if (result.kind === "unusable") {
    throw serviceUnavailable(kind === "DRAFT" ? DRAFT_UNUSABLE : REPLY_UNUSABLE);
  }
  return result.value;
}

interface NewMessage {
  role: MessageRole;
  content: string;
  createdAt: Date;
}

/**
 * Saves messages, but only into a session that is still open and still held by this call's claim:
 * one that ended or was deleted while Claude was answering keeps nothing from the call, and so does
 * one whose claim ran out and was taken by a newer request. Lets go of the claim in the same write.
 */
export async function saveMessages(sessionId: string, claim: Date, messages: NewMessage[]) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { count } = await tx.chatSession.updateMany({
      where: { id: sessionId, status: "OPEN", replyStartedAt: claim },
      data: { replyStartedAt: null },
    });
    if (count === 0) {
      const session = await tx.chatSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (!session) {
        throw notFound(SESSION_NOT_FOUND);
      }
      throw conflict(session.status === "OPEN" ? REPLY_IN_FLIGHT : SESSION_CLOSED);
    }
    const saved = [];
    for (const message of messages) {
      saved.push(await tx.chatMessage.create({ data: { sessionId, ...message } }));
    }
    return saved;
  });
}
