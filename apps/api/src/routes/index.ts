import { Router } from "express";
import { meRouter } from "./me.js";
import { rocketsRouter } from "./rockets.js";

// Everything mounted here is behind a session. See app.ts.
export const apiRouter = Router();

apiRouter.use("/me", meRouter);
apiRouter.use("/rockets", rocketsRouter);
