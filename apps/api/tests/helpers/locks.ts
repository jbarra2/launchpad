import type { Prisma } from "../../src/generated/prisma/client.js";
import { prisma } from "../../src/lib/prisma.js";

// For tests that hold a lock in the database and watch a request wait on it, with no sleeps.

interface LockWait {
  /** Count only requests blocked by this backend (the test's own transaction). */
  blockedBy?: number;
  /** How many requests must be waiting. */
  atLeast?: number;
}

/**
 * Waits until requests are held up by a lock in the database, or have answered without waiting.
 * A test that holds a lock uses this instead of a sleep, so it never passes by luck.
 */
export async function lockWaitOrAnswer(
  answered: () => boolean,
  { blockedBy, atLeast = 1 }: LockWait = {},
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (answered()) {
      return;
    }
    const [row] =
      blockedBy === undefined
        ? await prisma.$queryRaw<{ waiting: bigint }[]>`
            SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`
        : await prisma.$queryRaw<{ waiting: bigint }[]>`
            SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND ${blockedBy}::int = ANY (pg_blocking_pids(pid))`;
    if (row && row.waiting >= BigInt(atLeast)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("The requests neither answered nor waited on a lock.");
}

/** The backend running a transaction, so a test can tell which requests it holds up. */
export async function backendOf(tx: Prisma.TransactionClient): Promise<number> {
  const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  return row!.pid;
}
