import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { jsonBody } from "./middleware/json-body.js";

// Sprint 3 puts the auth handler before the body parser and the session checks before the routes.
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
  app.use(jsonBody);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
