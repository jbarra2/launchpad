import { Router } from "express";
import { meRouter } from "./me.js";
import { rocketsRouter } from "./rockets.js";
import { sessionsRouter } from "./sessions.js";

// Everything mounted here is behind a session. See app.ts.
export const apiRouter = Router();

apiRouter.use("/me", meRouter);
apiRouter.use("/rockets", rocketsRouter);
apiRouter.use("/sessions", sessionsRouter);
