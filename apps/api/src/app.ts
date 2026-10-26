import { toNodeHandler } from "better-auth/node";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { auth } from "./lib/auth.js";
import { prisma } from "./lib/prisma.js";
import {
  forwardClientIp,
  refuseUnlistedAuthPath,
  requireSession,
  requireTrustedOrigin,
} from "./middleware/auth.js";
import { limitBodySize } from "./middleware/body-limit.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { jsonBody } from "./middleware/json-body.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.set("etag", false);
  app.use(helmet());
  // Every response is one person's data or an error about it, so no cache may keep any of it.
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(forwardClientIp);

  // Better Auth reads the request body itself, so it comes before the JSON parser. An unlisted path
  // and a body of any size are both refused in front of it, because it would count the one and read
  // the other before it checked anything.
  app.use("/api/auth", refuseUnlistedAuthPath, limitBodySize());
  app.all("/api/auth/{*any}", toNodeHandler(auth));

  // The two routes with no session: this one and the auth routes above.
  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  // Deny by default. The session and the origin are checked before a body is read or trusted, so a
  // stranger gets 401 and another site gets 403 whatever the body says.
  app.use("/api", requireTrustedOrigin, requireSession);
  app.use("/api", jsonBody);
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
