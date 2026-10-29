import {
  chatSession,
  messageBody,
  partDraft,
  sentMessages,
  SESSION_MESSAGE_LIMIT,
  sessionIdParam,
} from "@launchpad/shared";
import { Router } from "express";
import { conflict, notFound, tooManyRequests } from "../errors/http-error.js";
import { prisma } from "../lib/prisma.js";
import { fromDbKind } from "../lib/rockets.js";
import { sessionOf } from "../lib/session.js";
import {
  callClaude,
  checkSessionForCall,
  claimReply,
  contextOf,
  loadSession,
  NEEDS_AN_ANSWER,
  releaseReply,
  saveMessages,
  SESSION_FULL,
  SESSION_NOT_FOUND,
  toChatMessage,
  toChatSession,
  transcriptOf,
} from "../lib/sessions.js";

export const sessionsRouter = Router();

// An id that could not name a session is a 404 before any query runs.
sessionsRouter.param("id", (_req, _res, next, value: string) => {
  if (!sessionIdParam.safeParse(value).success) {
    throw notFound(SESSION_NOT_FOUND);
  }
  next();
});

// A closed session stays readable: its transcript is kept with the idea.
sessionsRouter.get("/:id", async (req, res) => {
  const { user } = sessionOf(res);
  res.json(chatSession.parse(toChatSession(await loadSession(user.id, req.params.id))));
});

// The person's message and Claude's reply are saved together once the reply is in, so a failed call
// leaves the session as it was and the person can send the same words again.
sessionsRouter.post("/:id/messages", async (req, res) => {
  const { user } = sessionOf(res);
  const { text } = messageBody.parse(req.body);
  await checkSessionForCall(user.id, req.params.id);
  const claim = await claimReply(req.params.id);
  try {
    // Read again once the claim is held, so the call sees every message saved before it.
    const session = await loadSession(user.id, req.params.id);
    const answers = session.messages.filter((message) => message.role === "USER").length;
    if (answers >= SESSION_MESSAGE_LIMIT) {
      throw tooManyRequests(SESSION_FULL);
    }
    const sentAt = new Date();
    const reply = await callClaude(session, "INTERVIEW", (claude) =>
      claude.reply(contextOf(session), [...transcriptOf(session), { role: "user", text }]),
    );
    const saved = await saveMessages(session.id, claim, [
      { role: "USER", content: text, createdAt: sentAt },
      { role: "ASSISTANT", content: reply, createdAt: new Date() },
    ]);
    res.json(sentMessages.parse({ messages: saved.map(toChatMessage) }));
  } finally {
    await releaseReply(req.params.id, claim);
  }
});

// Claude's draft of the part. Nothing is saved: the person edits it and attaches it.
sessionsRouter.post("/:id/draft", async (req, res) => {
  const { user } = sessionOf(res);
  await checkSessionForCall(user.id, req.params.id);
  const claim = await claimReply(req.params.id);
  try {
    const session = await loadSession(user.id, req.params.id);
    if (!session.messages.some((message) => message.role === "USER")) {
      throw conflict(NEEDS_AN_ANSWER);
    }
    const draft = await callClaude(session, "DRAFT", (claude) =>
      claude.draft(contextOf(session), transcriptOf(session), fromDbKind(session.part)),
    );
    res.json(partDraft.parse(draft));
  } finally {
    await releaseReply(req.params.id, claim);
  }
});

// Ends the session without attaching anything. Ending one that has ended already is fine.
sessionsRouter.post("/:id/close", async (req, res) => {
  const { user } = sessionOf(res);
  const session = await loadSession(user.id, req.params.id);
  await prisma.chatSession.updateMany({
    where: { id: session.id, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date(), replyStartedAt: null },
  });
  res.status(204).end();
});
