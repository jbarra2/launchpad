import {
  buildKickoffMarkdown,
  buildPlanMarkdown,
  canWritePart,
  createRocketBody,
  KICKOFF_FILE,
  nextPartKind,
  PART_INFO,
  PART_KINDS,
  partBody,
  partKindParam,
  PLAN_FILE,
  ROCKET_LIMIT,
  rocketDetail,
  rocketIdParam,
  rocketList,
  rocketListQuery,
  type PartKind,
} from "@launchpad/shared";
import { Router, type Response } from "express";
import { conflict, notFound } from "../errors/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  attachedKinds,
  loadRocket,
  lockBuildingRocket,
  PARTS_IN_ORDER,
  ROCKET_NOT_FOUND,
  toDbKind,
  toDbStatus,
  toDetail,
  toSummary,
} from "../lib/rockets.js";
import { sessionOf } from "../lib/session.js";

export const rocketsRouter = Router();

const LIMIT_REACHED = `You have ${ROCKET_LIMIT} ideas, the most the pad holds. Delete one to make room.`;
const NOT_READY = "Add all six parts before you launch.";

// An id or a kind that could not name anything is a 404 before any query runs.
rocketsRouter.param("id", (_req, _res, next, value: string) => {
  if (!rocketIdParam.safeParse(value).success) {
    throw notFound(ROCKET_NOT_FOUND);
  }
  next();
});

rocketsRouter.param("kind", (_req, _res, next, value: string) => {
  if (!partKindParam.safeParse(value).success) {
    throw notFound("A rocket has no part by that name.");
  }
  next();
});

function sendDetail(res: Response, rocket: Awaited<ReturnType<typeof loadRocket>>, status = 200) {
  res.status(status).json(rocketDetail.parse(toDetail(rocket)));
}

rocketsRouter.get("/", async (req, res) => {
  const { user } = sessionOf(res);
  const { status } = rocketListQuery.parse(req.query);
  const rockets = await prisma.rocket.findMany({
    where: { userId: user.id, ...(status ? { status: toDbStatus(status) } : {}) },
    orderBy: { updatedAt: "desc" },
    take: ROCKET_LIMIT,
    select: {
      id: true,
      name: true,
      status: true,
      launchedAt: true,
      updatedAt: true,
      parts: { select: { kind: true } },
    },
  });
  res.json(rocketList.parse({ rockets: rockets.map(toSummary) }));
});

rocketsRouter.post("/", async (req, res) => {
  const { user } = sessionOf(res);
  const body = createRocketBody.parse(req.body);
  const rocket = await prisma.$transaction(async (tx) => {
    // Two creates at once would both count 19 and both go in. Holding the person's own row makes
    // them take turns, so the second one counts the first.
    await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${user.id} FOR UPDATE`;
    if ((await tx.rocket.count({ where: { userId: user.id } })) >= ROCKET_LIMIT) {
      throw conflict(LIMIT_REACHED);
    }
    // The idea and its Engine are one write: the pitch is the Engine's summary, and the "why" its
    // first point.
    return tx.rocket.create({
      data: {
        userId: user.id,
        name: body.name,
        pitch: body.pitch,
        parts: {
          create: {
            kind: "ENGINE",
            summary: body.pitch,
            points: body.why ? [body.why] : [],
            source: "MANUAL",
          },
        },
      },
      include: PARTS_IN_ORDER,
    });
  });
  sendDetail(res, rocket, 201);
});

rocketsRouter.get("/:id", async (req, res) => {
  const { user } = sessionOf(res);
  sendDetail(res, await loadRocket(user.id, req.params.id));
});

// A launched idea can still be deleted, so a person at the limit can always make room.
rocketsRouter.delete("/:id", async (req, res) => {
  const { user } = sessionOf(res);
  const { count } = await prisma.rocket.deleteMany({
    where: { id: req.params.id, userId: user.id },
  });
  if (count === 0) {
    throw notFound(ROCKET_NOT_FOUND);
  }
  res.status(204).end();
});

// Writes a part by hand: the next one, or one that is on already. The body is checked first, then
// the idea is locked, so a launch cannot slip in between the check and the write.
rocketsRouter.put("/:id/parts/:kind", async (req, res) => {
  const { user } = sessionOf(res);
  const kind = req.params.kind as PartKind;
  const body = partBody.parse(req.body);
  const rocket = await prisma.$transaction(async (tx) => {
    await lockBuildingRocket(tx, user.id, req.params.id);
    const attached = attachedKinds(
      await tx.part.findMany({ where: { rocketId: req.params.id }, select: { kind: true } }),
    );
    if (!canWritePart(attached, kind)) {
      // There is always a next part here: with all six on, every part can be written.
      const next = nextPartKind(attached) ?? kind;
      throw conflict(`Add the ${PART_INFO[next].name} before the ${PART_INFO[kind].name}.`);
    }
    const data = { summary: body.summary, points: body.points, source: "MANUAL" as const };
    await tx.part.upsert({
      where: { rocketId_kind: { rocketId: req.params.id, kind: toDbKind(kind) } },
      create: { rocketId: req.params.id, kind: toDbKind(kind), ...data },
      update: data,
    });
    return loadRocket(user.id, req.params.id, tx);
  });
  sendDetail(res, rocket);
});

rocketsRouter.post("/:id/launch", async (req, res) => {
  const { user } = sessionOf(res);
  const rocket = await prisma.$transaction(async (tx) => {
    await lockBuildingRocket(tx, user.id, req.params.id);
    if ((await tx.part.count({ where: { rocketId: req.params.id } })) < PART_KINDS.length) {
      // Thrown inside the transaction, so the lock's touch of updatedAt is undone too.
      throw conflict(NOT_READY);
    }
    // The launch time is taken once the lock is held, after any part write that came first.
    await tx.rocket.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { status: "LAUNCHED", launchedAt: new Date() },
    });
    return loadRocket(user.id, req.params.id, tx);
  });
  sendDetail(res, rocket);
});

// The two exports are downloads under fixed names. The idea's name goes into the file and never
// into a header. They work before launch too.
function sendMarkdown(res: Response, fileName: string, text: string) {
  res.set("Content-Disposition", `attachment; filename="${fileName}"`);
  res.type("text/markdown");
  res.send(text);
}

rocketsRouter.get("/:id/plan.md", async (req, res) => {
  const { user } = sessionOf(res);
  const rocket = toDetail(await loadRocket(user.id, req.params.id));
  sendMarkdown(res, PLAN_FILE, buildPlanMarkdown(rocket));
});

rocketsRouter.get("/:id/kickoff.md", async (req, res) => {
  const { user } = sessionOf(res);
  const rocket = toDetail(await loadRocket(user.id, req.params.id));
  sendMarkdown(res, KICKOFF_FILE, buildKickoffMarkdown(rocket));
});
