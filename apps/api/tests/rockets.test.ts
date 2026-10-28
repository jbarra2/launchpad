import {
  buildKickoffMarkdown,
  buildPlanMarkdown,
  PART_KINDS,
  ROCKET_LIMIT,
  type PartKind,
  type RocketDetail,
} from "@launchpad/shared";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import { lockBuildingRocket } from "../src/lib/rockets.js";
import { createVerifiedUser, del, get, PASSWORD, post, put } from "./helpers/auth.js";

// The rockets API. Every route is scoped to the signed-in person: someone else's idea is a 404, the
// same answer as an idea that does not exist, and is left exactly as it was.

const idea = { name: "Recipe Swap", pitch: "Trade family recipes with people you trust." };
const NOT_FOUND = { error: "That idea was not found." };
const LAUNCHED = { error: "This idea has launched, so it can no longer change." };

function part(label = "first") {
  return { summary: `The ${label} summary.`, points: [`A ${label} point`] };
}

async function createRocket(cookie: string, body: Record<string, unknown> = idea) {
  const response = await post("/api/rockets", body, { cookie });
  expect(response.status).toBe(201);
  return response.body as RocketDetail;
}

/** Writes the parts after the Engine, up to and including `last`. */
async function addParts(cookie: string, id: string, last: PartKind = "nose") {
  for (const kind of PART_KINDS.slice(1, PART_KINDS.indexOf(last) + 1)) {
    const response = await put(`/api/rockets/${id}/parts/${kind}`, part(kind), { cookie });
    expect(response.status, kind).toBe(200);
  }
}

async function launchedRocket(cookie: string) {
  const rocket = await createRocket(cookie);
  await addParts(cookie, rocket.id);
  expect((await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie })).status).toBe(200);
  return rocket;
}

/** The rocket and its parts as stored, for checking that a refused request changed nothing. */
function snapshot(id: string) {
  return prisma.rocket.findUnique({ where: { id }, include: { parts: true } });
}

/** Rockets made straight in the database, for the limit tests. */
async function seedRockets(userId: string, count: number, status: "BUILDING" | "LAUNCHED") {
  await prisma.rocket.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId,
      name: `Seeded ${i}`,
      pitch: "A seeded pitch.",
      status,
      launchedAt: status === "LAUNCHED" ? new Date() : null,
    })),
  });
}

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
async function lockWaitOrAnswer(
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
async function backendOf(tx: Prisma.TransactionClient): Promise<number> {
  const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  return row!.pid;
}

describe("POST /api/rockets", () => {
  it("creates the idea and its Engine together: the pitch is the summary, the why its first point", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const response = await post(
      "/api/rockets",
      { ...idea, why: "Gran's recipes are on scraps of paper." },
      { cookie: ana.cookie },
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Recipe Swap",
      pitch: idea.pitch,
      status: "building",
      launchedAt: null,
      parts: [
        {
          kind: "engine",
          summary: idea.pitch,
          points: ["Gran's recipes are on scraps of paper."],
          source: "manual",
        },
      ],
    });
    const stored = await prisma.rocket.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(stored.userId).toBe(ana.userId);
    expect(JSON.stringify(response.body)).not.toContain(ana.userId);
  });

  it("gives the Engine no points when there is no why", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie, { ...idea, why: "" });
    expect(rocket.parts[0]?.points).toEqual([]);
  });

  it("refuses a body that is not valid, with details, and creates nothing", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const response = await post(
      "/api/rockets",
      { ...idea, name: "n".repeat(81) },
      {
        cookie: ana.cookie,
      },
    );
    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      { path: "name", message: "Use 80 characters or fewer for the name." },
    ]);
    expect(await prisma.rocket.count()).toBe(0);
  });

  it("takes the owner from the session: a userId in the body is refused", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const response = await post(
      "/api/rockets",
      { ...idea, userId: ben.userId },
      {
        cookie: ana.cookie,
      },
    );
    expect(response.status).toBe(400);
    expect(await prisma.rocket.count()).toBe(0);
  });

  it("refuses the 21st idea, launched ones included, and keeps 20", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await seedRockets(ana.userId, ROCKET_LIMIT - 5, "BUILDING");
    await seedRockets(ana.userId, 5, "LAUNCHED");
    const response = await post("/api/rockets", idea, { cookie: ana.cookie });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "You have 20 ideas, the most the pad holds. Delete one to make room.",
    });
    expect(await prisma.rocket.count({ where: { userId: ana.userId } })).toBe(ROCKET_LIMIT);
  });

  it("counts only the person's own ideas toward the limit", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await seedRockets(ben.userId, ROCKET_LIMIT, "BUILDING");
    expect((await post("/api/rockets", idea, { cookie: ana.cookie })).status).toBe(201);
  });

  it("lets only one of several creates at once take the last place", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await seedRockets(ana.userId, ROCKET_LIMIT - 1, "BUILDING");
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post("/api/rockets", { ...idea, name: `Race ${i}` }, { cookie: ana.cookie }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.rocket.count({ where: { userId: ana.userId } })).toBe(ROCKET_LIMIT);
  });

  it("makes a create wait for one already under way, so the limit holds when two arrive at once", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await seedRockets(ana.userId, ROCKET_LIMIT - 1, "BUILDING");
    let answered = false;
    let pending: Promise<{ status: number }> | undefined;
    await prisma.$transaction(
      async (tx) => {
        // Another create, part way through: it has read the person's row and written the 20th.
        // A share lock is the weakest hold that still has to keep a second create waiting, so only
        // a route that takes FOR UPDATE waits here.
        await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${ana.userId} FOR SHARE`;
        await tx.rocket.create({ data: { userId: ana.userId, name: "The 20th", pitch: "P" } });
        const holder = await backendOf(tx);
        pending = post("/api/rockets", idea, { cookie: ana.cookie }).then((response) => {
          answered = true;
          return response;
        });
        await lockWaitOrAnswer(() => answered, { blockedBy: holder });
        // Without the lock it would have counted 19 and gone in.
        expect(answered).toBe(false);
      },
      { timeout: 15_000 },
    );
    expect((await pending)?.status).toBe(409);
    expect(await prisma.rocket.count({ where: { userId: ana.userId } })).toBe(ROCKET_LIMIT);
  });
  it("makes two creates at the last place take turns, so only one goes in", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await seedRockets(ana.userId, ROCKET_LIMIT - 1, "BUILDING");
    const statuses: number[] = [];
    let pending: Promise<unknown>[] = [];
    await prisma.$transaction(
      async (tx) => {
        // New ideas cannot be written while this is held, so the first create stops at its insert,
        // still holding whatever it locked. The second must then wait for the first.
        await tx.$executeRaw`LOCK TABLE "Rocket" IN SHARE MODE`;
        const send = (name: string) =>
          post("/api/rockets", { ...idea, name }, { cookie: ana.cookie }).then((r) => {
            statuses.push(r.status);
          });
        const holder = await backendOf(tx);
        pending = [send("First")];
        await lockWaitOrAnswer(() => statuses.length > 0, { blockedBy: holder });
        // The first create's own backend: the one this transaction is holding up.
        const [first] = await prisma.$queryRaw<{ pid: number }[]>`
          SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND ${holder}::int = ANY (pg_blocking_pids(pid))`;
        pending.push(send("Second"));
        await lockWaitOrAnswer(() => statuses.length > 1, { blockedBy: first?.pid ?? -1 });
      },
      { timeout: 15_000 },
    );
    await Promise.all(pending);
    expect(statuses.sort()).toEqual([201, 409]);
    expect(await prisma.rocket.count({ where: { userId: ana.userId } })).toBe(ROCKET_LIMIT);
  });

  describe("when the database refuses the Engine", () => {
    // A trigger that refuses a part only for a pitch of its own, so one left behind by a stopped
    // run touches nothing else. It is dropped first in case one was.
    const FAULT = "Refused by the test as a fault";
    const CHECK = "Refused by the test as a check";

    async function withRefusingTrigger(run: () => Promise<void>) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS refuse_part ON "Part"`);
      try {
        await prisma.$executeRawUnsafe(`
          CREATE OR REPLACE FUNCTION refuse_part() RETURNS trigger AS $$
          BEGIN
            IF NEW.summary = '${CHECK}' THEN
              RAISE EXCEPTION 'refused for the test' USING ERRCODE = 'check_violation';
            END IF;
            RAISE EXCEPTION 'refused for the test';
          END $$ LANGUAGE plpgsql`);
        await prisma.$executeRawUnsafe(`
          CREATE TRIGGER refuse_part BEFORE INSERT ON "Part" FOR EACH ROW
          WHEN (NEW.summary IN ('${FAULT}', '${CHECK}')) EXECUTE FUNCTION refuse_part()`);
        await run();
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS refuse_part ON "Part"`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS refuse_part()`);
      }
    }

    it("leaves no idea behind, and a fault stays a fault", async () => {
      const ana = await createVerifiedUser("ana@example.com");
      await withRefusingTrigger(async () => {
        const response = await post(
          "/api/rockets",
          { ...idea, pitch: FAULT },
          {
            cookie: ana.cookie,
          },
        );
        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: "Something went wrong on our side. Try again in a moment.",
        });
        expect(await prisma.rocket.count()).toBe(0);
      });
    });

    it("answers a failed check as input that is not valid, with no idea left behind", async () => {
      const ana = await createVerifiedUser("ana@example.com");
      await withRefusingTrigger(async () => {
        const response = await post(
          "/api/rockets",
          { ...idea, pitch: CHECK },
          {
            cookie: ana.cookie,
          },
        );
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          error: "Some of what you entered is not valid. Check it and try again.",
        });
        expect(await prisma.rocket.count()).toBe(0);
      });
    });
  });

  it("takes every value at its cap", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const created = await post(
      "/api/rockets",
      { name: "n".repeat(80), pitch: "p".repeat(200), why: "w".repeat(200) },
      { cookie: ana.cookie },
    );
    expect(created.status).toBe(201);
    const full = { summary: "s".repeat(600), points: Array(8).fill("q".repeat(200)) };
    const written = await put(`/api/rockets/${created.body.id}/parts/fuel`, full, {
      cookie: ana.cookie,
    });
    expect(written.status).toBe(200);
    expect(written.body.parts[1]).toMatchObject(full);
  });
});

describe("GET /api/rockets", () => {
  it("lists only the person's own ideas, the most recently changed first, with the parts that are on", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const older = await createRocket(ana.cookie, { ...idea, name: "Older" });
    const newer = await createRocket(ana.cookie, { ...idea, name: "Newer" });
    await createRocket(ben.cookie, { ...idea, name: "Ben's" });
    await addParts(ana.cookie, older.id, "body");

    const response = await get("/api/rockets", { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.body.rockets.map((r: { name: string }) => r.name)).toEqual(["Older", "Newer"]);
    expect(response.body.rockets[0]).toMatchObject({
      id: older.id,
      status: "building",
      parts: ["engine", "fuel", "body"],
      launchedAt: null,
    });
    expect(response.body.rockets[1].id).toBe(newer.id);
    expect(JSON.stringify(response.body)).not.toContain(ana.userId);
  });

  it("lists at most 20, even when more are stored", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await seedRockets(ana.userId, ROCKET_LIMIT + 5, "BUILDING");
    const response = await get("/api/rockets", { cookie: ana.cookie });
    expect(response.body.rockets).toHaveLength(ROCKET_LIMIT);
  });

  it("answers an empty list for a new person", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    expect((await get("/api/rockets", { cookie: ana.cookie })).body).toEqual({ rockets: [] });
  });

  it("filters by status, and only among the person's own ideas", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await launchedRocket(ben.cookie);
    await createRocket(ben.cookie, { ...idea, name: "Ben's still building" });
    const launched = await launchedRocket(ana.cookie);
    const building = await createRocket(ana.cookie, { ...idea, name: "Still building" });
    const onlyLaunched = await get("/api/rockets?status=launched", { cookie: ana.cookie });
    expect(onlyLaunched.body.rockets.map((r: { id: string }) => r.id)).toEqual([launched.id]);
    expect(onlyLaunched.body.rockets[0].launchedAt).toEqual(expect.any(String));
    const onlyBuilding = await get("/api/rockets?status=building", { cookie: ana.cookie });
    expect(onlyBuilding.body.rockets.map((r: { id: string }) => r.id)).toEqual([building.id]);
    expect(onlyBuilding.text).not.toContain("Ben's");
  });

  it("refuses a status it does not know, and any other question, such as whose ideas", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await createRocket(ben.cookie);
    expect((await get("/api/rockets?status=all", { cookie: ana.cookie })).status).toBe(400);
    expect(
      (await get("/api/rockets?status=launched&status=building", { cookie: ana.cookie })).status,
    ).toBe(400);
    const nosy = await get(`/api/rockets?userId=${ben.userId}`, { cookie: ana.cookie });
    expect(nosy.status).toBe(400);
    expect(JSON.stringify(nosy.body)).not.toContain("Recipe Swap");
  });
});

describe("GET /api/rockets/:id", () => {
  it("answers the idea with its parts in order", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "avionics");
    const response = await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.body.parts.map((p: { kind: string }) => p.kind)).toEqual([
      "engine",
      "fuel",
      "body",
      "avionics",
    ]);
    expect(response.body.parts[1]).toMatchObject({ ...part("fuel"), source: "manual" });
    expect(response.body).not.toHaveProperty("userId");
  });

  it("answers the idea it is asked for, among several of the person's own", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const first = await createRocket(ana.cookie, { ...idea, name: "First" });
    const second = await createRocket(ana.cookie, { ...idea, name: "Second" });
    for (const rocket of [first, second]) {
      const response = await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
      expect(response.body).toMatchObject({ id: rocket.id, name: rocket.name });
      const plan = await get(`/api/rockets/${rocket.id}/plan.md`, { cookie: ana.cookie });
      expect(plan.text.startsWith(`# ${rocket.name}\n`)).toBe(true);
    }
  });

  it("answers the parts in order, whatever order they were stored in", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    for (const kind of ["NOSE", "FINS", "AVIONICS", "BODY", "FUEL"] as const) {
      await prisma.part.create({
        data: { rocketId: rocket.id, kind, summary: kind, points: [], source: "MANUAL" },
      });
    }
    // With fresh statistics on a table this small, Postgres reads it straight through, in the order
    // the rows were stored, rather than through the index that happens to be in kind order.
    await prisma.$executeRaw`ANALYZE "Part"`;
    const plan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN SELECT * FROM "Part" WHERE "rocketId" IN (${rocket.id})`;
    // If Postgres ever reads through the (rocketId, kind) index instead, the rows would come back in
    // kind order with no ORDER BY at all, and this test could no longer tell.
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("Seq Scan");
    const response = await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
    expect(response.body.parts.map((p: { kind: string }) => p.kind)).toEqual([...PART_KINDS]);
  });

  it("answers 404 for an id that does not exist or is not in the shape of one", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    for (const id of ["cnotarealid000000000000000", "NOT-AN-ID", "a".repeat(41), "%2e%2e"]) {
      const response = await get(`/api/rockets/${id}`, { cookie: ana.cookie });
      expect(response.status, id).toBe(404);
      expect(response.body, id).toEqual(NOT_FOUND);
    }
  });
});

describe("an address that cannot name an idea", () => {
  it("is a 404 before any query runs", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const reads = vi.spyOn(prisma.rocket, "findFirst");
    const deletes = vi.spyOn(prisma.rocket, "deleteMany");
    const writes = vi.spyOn(prisma, "$transaction");
    try {
      for (const id of ["NOT-AN-ID", "a".repeat(41), "a_b"]) {
        expect((await get(`/api/rockets/${id}`, { cookie: ana.cookie })).status).toBe(404);
        expect((await get(`/api/rockets/${id}/plan.md`, { cookie: ana.cookie })).status).toBe(404);
        expect((await del(`/api/rockets/${id}`, { cookie: ana.cookie })).status).toBe(404);
        const write = await put(`/api/rockets/${id}/parts/fuel`, part(), { cookie: ana.cookie });
        expect(write.status).toBe(404);
        expect(write.body).toEqual(NOT_FOUND);
      }
      expect(reads).not.toHaveBeenCalled();
      expect(deletes).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
      // The same request with an id in the right shape does reach the database, so the spies above
      // would have seen a query if one had run.
      const missing = await get("/api/rockets/cnotarealid000000000000000", { cookie: ana.cookie });
      expect(missing.status).toBe(404);
      expect(reads).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("an address that cannot be read", () => {
  it("is a 404, not a fault", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const path of [
        "/api/rockets/%E0",
        "/api/rockets/%E0/parts/fuel",
        "/api/rockets/c1/parts/%FF",
      ]) {
        const response = await get(path, { cookie: ana.cookie });
        expect(response.status, path).toBe(404);
        expect(response.body, path).toEqual({ error: "Nothing was found at that address." });
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("PUT /api/rockets/:id/parts/:kind", () => {
  it("attaches the next part, written by hand", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const response = await put(`/api/rockets/${rocket.id}/parts/fuel`, part("fuel"), {
      cookie: ana.cookie,
    });
    expect(response.status).toBe(200);
    expect(response.body.parts.map((p: { kind: string }) => p.kind)).toEqual(["engine", "fuel"]);
    expect(response.body.parts[1]).toMatchObject({ ...part("fuel"), source: "manual" });
  });

  it("refuses a part out of order with 409 and a sentence, and stores nothing", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const response = await put(`/api/rockets/${rocket.id}/parts/body`, part(), {
      cookie: ana.cookie,
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Add the Fuel tank before the Body." });
    expect(await prisma.part.count()).toBe(1);
  });

  it("judges the order from this idea's parts alone, whatever other ideas have", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const bens = await createRocket(ben.cookie);
    await addParts(ben.cookie, bens.id, "body");
    const anas = await createRocket(ana.cookie);
    const response = await put(`/api/rockets/${anas.id}/parts/body`, part(), {
      cookie: ana.cookie,
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Add the Fuel tank before the Body." });
  });

  it("edits a part that is already on, after later ones", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "body");
    const response = await put(`/api/rockets/${rocket.id}/parts/engine`, part("new"), {
      cookie: ana.cookie,
    });
    expect(response.status).toBe(200);
    expect(response.body.parts[0]).toMatchObject(part("new"));
    expect(response.body.parts).toHaveLength(3);
    expect(await prisma.part.count()).toBe(3);
  });

  it("moves the idea to the top of the list when a part changes", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const first = await createRocket(ana.cookie, { ...idea, name: "First" });
    await createRocket(ana.cookie, { ...idea, name: "Second" });
    await addParts(ana.cookie, first.id, "fuel");
    const list = await get("/api/rockets", { cookie: ana.cookie });
    expect(list.body.rockets[0].id).toBe(first.id);
  });

  it("refuses a body that is not valid and leaves the part as it was", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const before = await snapshot(rocket.id);
    for (const body of [
      { summary: "s", points: Array(9).fill("p") },
      { summary: "s".repeat(601), points: [] },
      { summary: "s", points: ["p".repeat(201)] },
      { summary: "s", points: [], source: "chat" },
      { summary: "", points: [] },
    ]) {
      const response = await put(`/api/rockets/${rocket.id}/parts/engine`, body, {
        cookie: ana.cookie,
      });
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(response.body.error).toBe(
        "Some of what you entered is not valid. Check it and try again.",
      );
    }
    expect(await snapshot(rocket.id)).toEqual(before);
  });

  it("answers 404 for a part kind that does not exist", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    for (const kind of ["wings", "FUEL", "Engine"]) {
      const response = await put(`/api/rockets/${rocket.id}/parts/${kind}`, part(), {
        cookie: ana.cookie,
      });
      expect(response.status, kind).toBe(404);
    }
  });

  it("refuses JSON it cannot read with 400", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const response = await put(`/api/rockets/${rocket.id}/parts/fuel`, {}, { cookie: ana.cookie })
      .set("content-type", "application/json")
      .send("{bad");
    expect(response.status).toBe(400);
  });
});

describe("POST /api/rockets/:id/launch", () => {
  it("refuses with five parts, and the idea is still being built", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "fins");
    const before = await snapshot(rocket.id);
    const response = await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Add all six parts before you launch." });
    const after = await snapshot(rocket.id);
    expect(after?.status).toBe("BUILDING");
    expect(after?.launchedAt).toBeNull();
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });

  it("counts only this idea's parts, whatever other ideas have", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const complete = await createRocket(ben.cookie);
    await addParts(ben.cookie, complete.id);
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "fins");
    const response = await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Add all six parts before you launch." });
  });

  it("launches only the idea it is asked to, and leaves the person's others building", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const other = await createRocket(ana.cookie, { ...idea, name: "Other" });
    await addParts(ana.cookie, other.id);
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id);
    const response = await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    const stored = await prisma.rocket.findUniqueOrThrow({ where: { id: other.id } });
    expect(stored.status).toBe("BUILDING");
    expect(stored.launchedAt).toBeNull();
  });

  it("launches with all six parts", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id);
    const response = await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("launched");
    expect(Date.parse(response.body.launchedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(response.body.parts).toHaveLength(6);
  });
});

describe("a launched idea", () => {
  it("refuses a part write, an edit of an attached part, and a second launch, with 409", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await launchedRocket(ana.cookie);
    const before = await snapshot(rocket.id);
    for (const kind of ["engine", "nose"]) {
      const response = await put(`/api/rockets/${rocket.id}/parts/${kind}`, part("late"), {
        cookie: ana.cookie,
      });
      expect(response.status, kind).toBe(409);
      expect(response.body).toEqual(LAUNCHED);
    }
    const again = await post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie });
    expect(again.status).toBe(409);
    expect(again.body).toEqual(LAUNCHED);
    expect(await snapshot(rocket.id)).toEqual(before);
  });

  it("can still be read, exported, and deleted", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await launchedRocket(ana.cookie);
    expect((await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie })).status).toBe(200);
    expect((await get(`/api/rockets/${rocket.id}/plan.md`, { cookie: ana.cookie })).status).toBe(
      200,
    );
    expect((await del(`/api/rockets/${rocket.id}`, { cookie: ana.cookie })).status).toBe(204);
    expect(await prisma.rocket.count()).toBe(0);
  });

  it("makes a second launch wait for one under way, then refuses it", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id);
    const firstLaunch = new Date("2026-10-27T12:00:00.000Z");
    let answered = false;
    let pending: Promise<{ status: number; body: unknown }> | undefined;
    await prisma.$transaction(
      async (tx) => {
        // The first launch, part way through: it holds the idea's row and has marked it launched.
        await tx.rocket.update({
          where: { id: rocket.id },
          data: { status: "LAUNCHED", launchedAt: firstLaunch },
        });
        const holder = await backendOf(tx);
        pending = post(`/api/rockets/${rocket.id}/launch`, {}, { cookie: ana.cookie }).then(
          (response) => {
            answered = true;
            return response;
          },
        );
        await lockWaitOrAnswer(() => answered, { blockedBy: holder });
        // A launch that read the status before taking the lock would already have gone through.
        expect(answered).toBe(false);
      },
      { timeout: 15_000 },
    );
    const response = await pending;
    expect(response?.status).toBe(409);
    expect(response?.body).toEqual(LAUNCHED);
    const stored = await prisma.rocket.findUniqueOrThrow({ where: { id: rocket.id } });
    expect(stored.launchedAt).toEqual(firstLaunch);
  });

  it("makes a part write wait for a launch under way, then refuses it", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id);
    const before = await snapshot(rocket.id);
    let answered = false;
    let pending: Promise<{ status: number; body: unknown }> | undefined;
    await prisma.$transaction(
      async (tx) => {
        // A launch part way through: it holds the idea's row and has marked it launched.
        await tx.rocket.update({
          where: { id: rocket.id },
          data: { status: "LAUNCHED", launchedAt: new Date() },
        });
        const holder = await backendOf(tx);
        pending = put(`/api/rockets/${rocket.id}/parts/fins`, part("late"), {
          cookie: ana.cookie,
        }).then((response) => {
          answered = true;
          return response;
        });
        await lockWaitOrAnswer(() => answered, { blockedBy: holder });
        // A write that read the status before taking the lock would already have gone through.
        expect(answered).toBe(false);
      },
      { timeout: 15_000 },
    );
    const response = await pending;
    expect(response?.status).toBe(409);
    expect(response?.body).toEqual(LAUNCHED);
    const after = await snapshot(rocket.id);
    expect(after?.parts).toEqual(before?.parts);
  });
});

describe("DELETE /api/rockets/:id", () => {
  it("deletes the idea and its parts, and a second delete is 404", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "body");
    const response = await del(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
    expect(response.status).toBe(204);
    expect(await prisma.rocket.count()).toBe(0);
    expect(await prisma.part.count()).toBe(0);
    const again = await del(`/api/rockets/${rocket.id}`, { cookie: ana.cookie });
    expect(again.status).toBe(404);
    expect(again.body).toEqual(NOT_FOUND);
  });
});

describe("DELETE /api/rockets/:id, among several ideas", () => {
  it("deletes only that idea, and leaves the person's others and everyone else's", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const doomed = await createRocket(ana.cookie, { ...idea, name: "Doomed" });
    const kept = await createRocket(ana.cookie, { ...idea, name: "Kept" });
    await addParts(ana.cookie, kept.id, "body");
    const bens = await createRocket(ben.cookie);
    expect((await del(`/api/rockets/${doomed.id}`, { cookie: ana.cookie })).status).toBe(204);
    expect(await prisma.rocket.findUnique({ where: { id: doomed.id } })).toBeNull();
    expect(await prisma.part.count({ where: { rocketId: kept.id } })).toBe(3);
    expect(await prisma.rocket.findUnique({ where: { id: bens.id } })).not.toBeNull();
  });
});

describe("the exported files", () => {
  it("PLAN.md is Markdown to download, under a fixed name, with every part", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await launchedRocket(ana.cookie);
    const detail = (await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie })).body;
    const response = await get(`/api/rockets/${rocket.id}/plan.md`, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="PLAN.md"');
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toBe(buildPlanMarkdown(detail));
    for (const kind of PART_KINDS.slice(1)) {
      expect(response.text).toContain(`The ${kind} summary.`);
    }
  });

  it("KICKOFF.md is the prompt with the plan, under a fixed name", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await launchedRocket(ana.cookie);
    const detail = (await get(`/api/rockets/${rocket.id}`, { cookie: ana.cookie })).body;
    const response = await get(`/api/rockets/${rocket.id}/kickoff.md`, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="KICKOFF.md"');
    expect(response.text).toBe(buildKickoffMarkdown(detail));
  });

  it("work before launch, and keep the idea's name out of the headers", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie, { ...idea, name: 'Ana\'s "best"; idea=1' });
    const response = await get(`/api/rockets/${rocket.id}/plan.md`, { cookie: ana.cookie });
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="PLAN.md"');
    expect(response.text).toContain("_Not written yet._");
    expect(response.text.startsWith('# Ana\'s "best"; idea=1\n')).toBe(true);
  });
});

describe("someone else's idea", () => {
  const routes = (id: string) =>
    [
      ["GET", `/api/rockets/${id}`],
      ["DELETE", `/api/rockets/${id}`],
      ["PUT", `/api/rockets/${id}/parts/engine`],
      ["PUT", `/api/rockets/${id}/parts/fuel`],
      ["POST", `/api/rockets/${id}/launch`],
      ["GET", `/api/rockets/${id}/plan.md`],
      ["GET", `/api/rockets/${id}/kickoff.md`],
    ] as const;

  function send(method: string, path: string, cookie: string) {
    if (method === "GET") return get(path, { cookie });
    if (method === "DELETE") return del(path, { cookie });
    if (method === "PUT") return put(path, part("intruder"), { cookie });
    return post(path, {}, { cookie });
  }

  it("is a 404 on every route, the same answer as no idea at all, and is left as it was", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    // Ben owns ideas of both kinds too, so a check that forgot the id would find one of his.
    await createRocket(ben.cookie, { ...idea, name: "Ben's building" });
    await launchedRocket(ben.cookie);
    // Five parts on purpose: one short, so a launch that skipped the owner would say so with a 409.
    const building = await createRocket(ana.cookie);
    await addParts(ana.cookie, building.id, "fins");
    const launched = await launchedRocket(ana.cookie);
    const before = [await snapshot(building.id), await snapshot(launched.id)];

    for (const rocket of [building, launched]) {
      for (const [method, path] of routes(rocket.id)) {
        const response = await send(method, path, ben.cookie);
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(response.body, `${method} ${path}`).toEqual(NOT_FOUND);
        expect(response.text, `${method} ${path}`).not.toContain("Recipe Swap");
      }
    }
    expect([await snapshot(building.id), await snapshot(launched.id)]).toEqual(before);
  });

  it("is a 404 to the lock itself, building or launched", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await createRocket(ben.cookie, { ...idea, name: "Ben's own" });
    const building = await createRocket(ana.cookie);
    const launched = await launchedRocket(ana.cookie);
    for (const rocket of [building, launched]) {
      await expect(
        prisma.$transaction((tx) => lockBuildingRocket(tx, ben.userId, rocket.id)),
      ).rejects.toMatchObject({ status: 404 });
    }
  });

  it("is the same 404 as an id that names nothing, for a person who owns ideas", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    await launchedRocket(ana.cookie);
    await createRocket(ana.cookie);
    const missing = "cnotarealid000000000000000";
    for (const response of [
      await put(`/api/rockets/${missing}/parts/fuel`, part(), { cookie: ana.cookie }),
      await post(`/api/rockets/${missing}/launch`, {}, { cookie: ana.cookie }),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
  });

  it("is not reached by naming the owner in the request", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    const rocket = await createRocket(ana.cookie);
    const response = await get(`/api/rockets/${rocket.id}?userId=${ana.userId}`, {
      cookie: ben.cookie,
    });
    expect(response.status).toBe(404);
  });
});

describe("without a session, or from another site", () => {
  it("answers 401 on every route when nobody is signed in", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    const id = rocket.id;
    for (const response of await Promise.all([
      get("/api/rockets"),
      post("/api/rockets", idea),
      get(`/api/rockets/${id}`),
      del(`/api/rockets/${id}`),
      put(`/api/rockets/${id}/parts/fuel`, part()),
      post(`/api/rockets/${id}/launch`, {}),
      get(`/api/rockets/${id}/plan.md`),
      get(`/api/rockets/${id}/kickoff.md`),
    ])) {
      expect(response.status).toBe(401);
    }
    expect(await prisma.part.count()).toBe(1);
  });

  it("refuses every change from another site with 403, and changes nothing", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const rocket = await createRocket(ana.cookie);
    await addParts(ana.cookie, rocket.id, "fins");
    const before = await snapshot(rocket.id);
    const options = { cookie: ana.cookie, origin: "https://evil.example" };
    for (const response of [
      await post("/api/rockets", idea, options),
      await del(`/api/rockets/${rocket.id}`, options),
      await put(`/api/rockets/${rocket.id}/parts/nose`, part(), options),
      await post(`/api/rockets/${rocket.id}/launch`, {}, options),
    ]) {
      expect(response.status).toBe(403);
    }
    expect(await prisma.rocket.count()).toBe(1);
    expect(await snapshot(rocket.id)).toEqual(before);
  });
});

describe("deleting the account", () => {
  it("removes the person's ideas and parts, and leaves everyone else's", async () => {
    const ana = await createVerifiedUser("ana@example.com");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    await launchedRocket(ana.cookie);
    const anaBuilding = await createRocket(ana.cookie);
    await addParts(ana.cookie, anaBuilding.id, "body");
    const bens = await createRocket(ben.cookie);
    await addParts(ben.cookie, bens.id, "fuel");

    const response = await post(
      "/api/auth/delete-user",
      { password: PASSWORD },
      { cookie: ana.cookie },
    );
    expect(response.status).toBe(200);
    expect(await prisma.rocket.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.rocket.count()).toBe(1);
    expect(await prisma.part.count()).toBe(2);
    expect((await get(`/api/rockets/${bens.id}`, { cookie: ben.cookie })).status).toBe(200);
  });
});

describe("the database itself", () => {
  // Prisma's code for any database error, with Postgres's code for a failed check under it.
  const CHECK_FAILED = {
    code: "P2039",
    meta: { driverAdapterError: { cause: { originalCode: "23514" } } },
  };

  async function storedRocket() {
    const ana = await createVerifiedUser("ana@example.com");
    return createRocket(ana.cookie);
  }

  it("refuses a ninth point, a missing list, or a missing point, whatever writes it", async () => {
    const rocket = await storedRocket();
    await expect(
      prisma.part.update({
        where: { rocketId_kind: { rocketId: rocket.id, kind: "ENGINE" } },
        data: { points: Array(9).fill("p") },
      }),
    ).rejects.toMatchObject(CHECK_FAILED);
    const checkFailed = { meta: { driverAdapterError: { cause: { originalCode: "23514" } } } };
    await expect(
      prisma.$executeRaw`UPDATE "Part" SET points = NULL WHERE "rocketId" = ${rocket.id}`,
    ).rejects.toMatchObject(checkFailed);
    await expect(
      prisma.$executeRaw`UPDATE "Part" SET points = ARRAY['a', NULL]::varchar[] WHERE "rocketId" = ${rocket.id}`,
    ).rejects.toMatchObject(checkFailed);
  });

  it("refuses a launched idea with no launch time, and a launch time on one still building", async () => {
    const rocket = await storedRocket();
    await expect(
      prisma.rocket.update({ where: { id: rocket.id }, data: { status: "LAUNCHED" } }),
    ).rejects.toMatchObject(CHECK_FAILED);
    await expect(
      prisma.rocket.update({ where: { id: rocket.id }, data: { launchedAt: new Date() } }),
    ).rejects.toMatchObject(CHECK_FAILED);
  });

  it("refuses text over each cap", async () => {
    const rocket = await storedRocket();
    // A real refusal is the class the error handler maps, not only an object of that shape.
    await expect(
      prisma.rocket.update({ where: { id: rocket.id }, data: { name: "n".repeat(81) } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(
      prisma.rocket.update({ where: { id: rocket.id }, data: { name: "n".repeat(81) } }),
    ).rejects.toMatchObject({ code: "P2000" });
    await expect(
      prisma.rocket.update({ where: { id: rocket.id }, data: { pitch: "p".repeat(201) } }),
    ).rejects.toMatchObject({ code: "P2000" });
    const where = { rocketId_kind: { rocketId: rocket.id, kind: "ENGINE" as const } };
    await expect(
      prisma.part.update({ where, data: { summary: "s".repeat(601) } }),
    ).rejects.toMatchObject({ code: "P2000" });
    await expect(
      prisma.part.update({ where, data: { points: ["p".repeat(201)] } }),
    ).rejects.toMatchObject({ code: "P2000" });
  });
});
