import {
  buildKickoffMarkdown,
  buildPlanMarkdown,
  canWritePart,
  chatSession,
  CLAUDE_MODEL,
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
import { conflict, HttpError, notFound } from "../errors/http-error.js";
import { requireUsableKey } from "../lib/api-keys.js";
import { lockPerson } from "../lib/person-lock.js";
import { prisma } from "../lib/prisma.js";
import {
  attachedKinds,
  loadRocket,
  lockBuildingRocket,
  ROCKET_DETAIL,
  ROCKET_NOT_FOUND,
  toDbKind,
  toDbStatus,
  toDetail,
  toSummary,
} from "../lib/rockets.js";
import { sessionOf } from "../lib/session.js";
import {
  callClaude,
  claimReply,
  contextOf,
  loadSession,
  OPENER_IN_FLIGHT,
  ownSession,
  releaseReply,
  REPLY_IN_FLIGHT,
  saveMessages,
  SESSION_CLOSED,
  SESSION_NOT_FOUND,
  SESSION_OTHER_PART,
  toChatSession,
} from "../lib/sessions.js";

export const rocketsRouter = Router();

const LIMIT_REACHED = `You have ${ROCKET_LIMIT} ideas, the most the pad holds. Delete one to make room.`;
const NOT_READY = "Add all six parts before you launch.";
const ALL_PARTS_ON = "All six parts are on. Edit one by hand, or launch the idea.";

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
    await lockPerson(tx, user.id);
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
      include: ROCKET_DETAIL,
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

// Writes a part: by hand, or from the draft of a chat session (`sessionId`). The body is checked
// first, then the idea is locked, so a launch cannot slip in between the check and the write.
rocketsRouter.put("/:id/parts/:kind", async (req, res) => {
  const { user } = sessionOf(res);
  const kind = req.params.kind as PartKind;
  const rocketId = req.params.id;
  const body = partBody.parse(req.body);
  const rocket = await prisma.$transaction(async (tx) => {
    await lockBuildingRocket(tx, user.id, rocketId);
    const attached = attachedKinds(
      await tx.part.findMany({ where: { rocketId }, select: { kind: true } }),
    );
    if (!canWritePart(attached, kind)) {
      // There is always a next part here: with all six on, every part can be written.
      const next = nextPartKind(attached) ?? kind;
      throw conflict(`Add the ${PART_INFO[next].name} before the ${PART_INFO[kind].name}.`);
    }
    if (body.sessionId) {
      // The session must be this person's, on this idea, and for this part. That it is still
      // open is checked by the write that closes it, below.
      const session = await tx.chatSession.findFirst({
        where: { ...ownSession(user.id, body.sessionId), rocketId },
        select: { part: true },
      });
      if (!session) {
        throw notFound(SESSION_NOT_FOUND);
      }
      if (session.part !== toDbKind(kind)) {
        throw conflict(SESSION_OTHER_PART);
      }
    }
    const data = {
      summary: body.summary,
      points: body.points,
      source: body.sessionId ? ("CHAT" as const) : ("MANUAL" as const),
    };
    await tx.part.upsert({
      where: { rocketId_kind: { rocketId, kind: toDbKind(kind) } },
      create: { rocketId, kind: toDbKind(kind), ...data },
      update: data,
    });
    // The part's open session closes with the write: the one the draft came from, which must still
    // be open, or one left open when the person chose to write the part by hand. Either way the next
    // session builds the next part, and a launched idea never has a session open.
    const closed = { status: "CLOSED" as const, closedAt: new Date(), replyStartedAt: null };
    if (body.sessionId) {
      const { count } = await tx.chatSession.updateMany({
        where: { id: body.sessionId, status: "OPEN" },
        data: closed,
      });
      if (count !== 1) {
        throw conflict(SESSION_CLOSED);
      }
    } else {
      await tx.chatSession.updateMany({
        where: { rocketId, part: toDbKind(kind), status: "OPEN" },
        data: closed,
      });
    }
    return loadRocket(user.id, rocketId, tx);
  });
  sendDetail(res, rocket);
});

// Opens a chat session for the next part, or answers with the one already open. Claude writes the
// first question once the session exists; if that call fails, the next request asks again.
rocketsRouter.post("/:id/sessions", async (req, res) => {
  const { user } = sessionOf(res);
  const rocketId = req.params.id;
  const { sessionId, created } = await prisma.$transaction(async (tx) => {
    // Holding the idea makes two requests take turns, so they cannot open two sessions.
    await lockBuildingRocket(tx, user.id, rocketId);
    const next = nextPartKind(
      attachedKinds(await tx.part.findMany({ where: { rocketId }, select: { kind: true } })),
    );
    if (!next) {
      throw conflict(ALL_PARTS_ON);
    }
    const open = await tx.chatSession.findFirst({
      where: { rocketId, status: "OPEN" },
      select: { id: true },
    });
    if (open) {
      return { sessionId: open.id, created: false };
    }
    await requireUsableKey(tx, user.id);
    const session = await tx.chatSession.create({
      data: { rocketId, part: toDbKind(next), model: CLAUDE_MODEL },
      select: { id: true },
    });
    return { sessionId: session.id, created: true };
  });

  let session = await loadSession(user.id, sessionId);
  if (session.messages.length === 0) {
    // A second Start, from another tab or a double tap, finds the first question on its way.
    const claim = await claimReply(sessionId).catch((error: unknown) => {
      throw error instanceof HttpError && error.message === REPLY_IN_FLIGHT
        ? conflict(OPENER_IN_FLIGHT)
        : error;
    });
    try {
      const fresh = await loadSession(user.id, sessionId);
      if (fresh.messages.length === 0) {
        const opener = await callClaude(fresh, "INTERVIEW", (claude) =>
          claude.reply(contextOf(fresh), []),
        );
        await saveMessages(sessionId, claim, [
          { role: "ASSISTANT", content: opener, createdAt: new Date() },
        ]);
      }
    } finally {
      await releaseReply(sessionId, claim);
    }
    session = await loadSession(user.id, sessionId);
  }
  res.status(created ? 201 : 200).json(chatSession.parse(toChatSession(session)));
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
