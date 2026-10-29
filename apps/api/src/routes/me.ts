import { apiKeyBody, meResponse, savedApiKey } from "@launchpad/shared";
import { Router } from "express";
import { countKeyCheck, keyState, toSavedKey } from "../lib/api-keys.js";
import { claudeHttpError, KEY_REJECTED_ON_SAVE } from "../lib/claude-errors.js";
import { makeClaude } from "../lib/claude.js";
import { encryptKey } from "../lib/credentials.js";
import { prisma } from "../lib/prisma.js";
import { sessionOf } from "../lib/session.js";

export const meRouter = Router();

// The shared schema picks the fields, so a password hash, a token on the session, or a saved key
// cannot leave through this route.
meRouter.get("/", async (_req, res) => {
  const { user } = sessionOf(res);
  res.json(meResponse.parse({ user, apiKey: await keyState(user.id) }));
});

// Checks a key with Anthropic before anything is stored, so a key that does not work never replaces
// one that does. The answer is the key's status and last 4 characters, never the key.
meRouter.put("/api-key", async (req, res) => {
  const { user } = sessionOf(res);
  const { key } = apiKeyBody.parse(req.body);
  await countKeyCheck(user.id);
  try {
    await makeClaude(key).checkKey();
  } catch (error) {
    throw claudeHttpError(error, KEY_REJECTED_ON_SAVE) ?? error;
  }
  const sealed = encryptKey(user.id, key);
  const fields = {
    ...sealed,
    last4: key.slice(-4),
    status: "VALID" as const,
    checkedAt: new Date(),
  };
  const saved = await prisma.apiCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...fields },
    update: fields,
    select: { status: true, keyVersion: true, last4: true, checkedAt: true },
  });
  res.json(savedApiKey.parse(toSavedKey(saved)));
});

meRouter.delete("/api-key", async (_req, res) => {
  const { user } = sessionOf(res);
  await prisma.apiCredential.deleteMany({ where: { userId: user.id } });
  res.status(204).end();
});
