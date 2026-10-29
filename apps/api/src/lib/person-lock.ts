import type { Prisma } from "../generated/prisma/client.js";

// Caps that count a person's rows (ideas, key checks, Claude calls) take the person's own row first,
// so two requests at the same moment take turns: the second one counts what the first one wrote.

export const HOUR_MS = 60 * 60 * 1000;

export const anHourAgo = () => new Date(Date.now() - HOUR_MS);

/** Holds the person's row until the transaction ends. */
export async function lockPerson(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${userId} FOR UPDATE`;
}
