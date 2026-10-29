import { KEY_CHECKS_PER_HOUR, type ApiKeyState, type SavedApiKey } from "@launchpad/shared";
import { env } from "../config/env.js";
import { badRequest, conflict, tooManyRequests } from "../errors/http-error.js";
import type { CredentialStatus, Prisma } from "../generated/prisma/client.js";
import { claudeHttpError, KEY_REJECTED } from "./claude-errors.js";
import { makeClaude, type Claude } from "./claude.js";
import { decryptKey, UnreadableKeyError } from "./credentials.js";
import { anHourAgo, lockPerson } from "./person-lock.js";
import { prisma } from "./prisma.js";

// A person's saved Claude key: its state for the pages, the cap on checking keys, and the one place
// a key is opened for a call.

export const NO_KEY = "Add your Claude key in Settings to build parts with Claude.";
const TOO_MANY_CHECKS = `You have checked a key ${KEY_CHECKS_PER_HOUR} times in the last hour, the most allowed. Try again later.`;
// A key saved under another CREDENTIAL_KEY version, or one whose row was changed, cannot be opened.
// The person can always save it again.
export const UNREADABLE = "Your saved Claude key could not be read. Replace it in Settings.";

interface StoredState {
  status: CredentialStatus;
  keyVersion: number;
  last4: string;
  checkedAt: Date;
}

/** A key works if Anthropic accepted it last time and this server can still open it. */
const usable = (row: Pick<StoredState, "status" | "keyVersion">) =>
  row.status === "VALID" && row.keyVersion === env.CREDENTIAL_KEY_VERSION;

export function toSavedKey(row: StoredState): SavedApiKey {
  return {
    status: usable(row) ? "valid" : "invalid",
    last4: row.last4,
    checkedAt: row.checkedAt.toISOString(),
  };
}

export async function keyState(userId: string): Promise<ApiKeyState> {
  const row = await prisma.apiCredential.findUnique({
    where: { userId },
    select: { status: true, keyVersion: true, last4: true, checkedAt: true },
  });
  return row ? toSavedKey(row) : { status: "none" };
}

/**
 * Counts one key check against the person's hourly cap, or refuses it. The person's own row is held
 * while counting, so checks sent at the same moment take turns and cannot pass the cap together.
 */
export async function countKeyCheck(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockPerson(tx, userId);
    const recent = await tx.keyCheck.count({
      where: { userId, createdAt: { gt: anHourAgo() } },
    });
    if (recent >= KEY_CHECKS_PER_HOUR) {
      throw tooManyRequests(TOO_MANY_CHECKS);
    }
    await tx.keyCheck.create({ data: { userId } });
  });
}

/** The refusal for a key that cannot be used, or none for one that can. */
function refusalFor(row: Pick<StoredState, "status" | "keyVersion"> | null) {
  if (!row) {
    return conflict(NO_KEY);
  }
  if (row.status === "INVALID") {
    return badRequest(KEY_REJECTED);
  }
  return row.keyVersion === env.CREDENTIAL_KEY_VERSION ? undefined : badRequest(UNREADABLE);
}

/** Refuses before anything is opened if the person has no key, or one that does not work. */
export async function requireUsableKey(
  db: Pick<Prisma.TransactionClient, "apiCredential">,
  userId: string,
): Promise<void> {
  const refusal = refusalFor(
    await db.apiCredential.findUnique({
      where: { userId },
      select: { status: true, keyVersion: true },
    }),
  );
  if (refusal) {
    throw refusal;
  }
}

/**
 * Runs `call` with a Claude client for the person's saved key. The key is opened here and goes no
 * further than the client this call makes. If Anthropic no longer accepts it, it is marked invalid
 * so the pages say so. Any error from the call comes back as a sentence for the person.
 */
export async function withSavedKey<T>(userId: string, call: (claude: Claude) => Promise<T>) {
  const row = await prisma.apiCredential.findUnique({ where: { userId } });
  const refusal = refusalFor(row);
  if (!row || refusal) {
    throw refusal;
  }
  // Marks this row, and only if it is still the one that was read: a key saved meanwhile in
  // another tab is a different key, and stays as Anthropic last judged it.
  const markInvalid = () =>
    prisma.apiCredential.updateMany({
      where: { userId, updatedAt: row.updatedAt },
      data: { status: "INVALID", checkedAt: new Date() },
    });
  let key: string;
  try {
    key = decryptKey(userId, row);
  } catch (error) {
    if (error instanceof UnreadableKeyError) {
      await markInvalid();
      throw badRequest(UNREADABLE);
    }
    throw error;
  }
  try {
    return await call(makeClaude(key));
  } catch (error) {
    const answer = claudeHttpError(error);
    if (answer?.message === KEY_REJECTED) {
      await markInvalid();
    }
    throw answer ?? error;
  }
}
