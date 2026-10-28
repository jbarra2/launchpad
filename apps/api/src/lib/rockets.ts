import {
  PART_KINDS,
  type PartKind,
  type PartResponse,
  type RocketDetail,
  type RocketStatus,
  type RocketSummary,
} from "@launchpad/shared";
import { conflict, notFound } from "../errors/http-error.js";
import type {
  PartKind as DbPartKind,
  Prisma,
  RocketStatus as DbRocketStatus,
} from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";

// Every read and write of an idea goes through the two helpers here, which take the signed-in
// person's id and refuse anyone else's idea with the same 404 as one that does not exist.

export const ROCKET_NOT_FOUND = "That idea was not found.";
export const ROCKET_LAUNCHED = "This idea has launched, so it can no longer change.";

type Db = Pick<Prisma.TransactionClient, "rocket">;

// Postgres sorts an enum in the order it was declared, which is the order of the parts.
export const PARTS_IN_ORDER = { parts: { orderBy: { kind: "asc" } } } as const;

export const toDbKind = (kind: PartKind) => kind.toUpperCase() as DbPartKind;
export const toDbStatus = (status: RocketStatus) => status.toUpperCase() as DbRocketStatus;
const fromDbKind = (kind: DbPartKind) => kind.toLowerCase() as PartKind;

/** The idea with its parts, if it is this person's. Anything else is a 404. */
export async function loadRocket(userId: string, id: string, db: Db = prisma) {
  const rocket = await db.rocket.findFirst({ where: { id, userId }, include: PARTS_IN_ORDER });
  if (!rocket) {
    throw notFound(ROCKET_NOT_FOUND);
  }
  return rocket;
}

/**
 * The first step of every change to an idea, inside the change's transaction. The update takes the
 * row's lock and checks the status in one step, so a part write and a launch take turns, and the
 * one that comes second sees what the first did. Someone else's idea is a 404, and a launched one is
 * a 409. Touching `updatedAt` puts the idea at the top of the pad.
 */
export async function lockBuildingRocket(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
): Promise<void> {
  const { count } = await tx.rocket.updateMany({
    where: { id, userId, status: "BUILDING" },
    data: { updatedAt: new Date() },
  });
  if (count === 1) {
    return;
  }
  const exists = await tx.rocket.findFirst({ where: { id, userId }, select: { id: true } });
  throw exists ? conflict(ROCKET_LAUNCHED) : notFound(ROCKET_NOT_FOUND);
}

/** The kinds that are on, in order. */
export function attachedKinds(parts: readonly { kind: DbPartKind }[]): PartKind[] {
  const kinds = parts.map((part) => fromDbKind(part.kind));
  return PART_KINDS.filter((kind) => kinds.includes(kind));
}

type StoredRocket = Awaited<ReturnType<typeof loadRocket>>;

/** The shape the shared schema answers with. The route parses it before it leaves. */
export function toDetail(rocket: StoredRocket): RocketDetail {
  return {
    id: rocket.id,
    name: rocket.name,
    pitch: rocket.pitch,
    status: rocket.status === "LAUNCHED" ? "launched" : "building",
    parts: rocket.parts.map((part): PartResponse => ({
      kind: fromDbKind(part.kind),
      summary: part.summary,
      points: part.points,
      source: part.source === "CHAT" ? "chat" : "manual",
      updatedAt: part.updatedAt.toISOString(),
    })),
    launchedAt: rocket.launchedAt?.toISOString() ?? null,
    createdAt: rocket.createdAt.toISOString(),
    updatedAt: rocket.updatedAt.toISOString(),
  };
}

export function toSummary(rocket: {
  id: string;
  name: string;
  status: DbRocketStatus;
  launchedAt: Date | null;
  updatedAt: Date;
  parts: { kind: DbPartKind }[];
}): RocketSummary {
  return {
    id: rocket.id,
    name: rocket.name,
    status: rocket.status === "LAUNCHED" ? "launched" : "building",
    parts: attachedKinds(rocket.parts),
    launchedAt: rocket.launchedAt?.toISOString() ?? null,
    updatedAt: rocket.updatedAt.toISOString(),
  };
}
