import { meResponse } from "@launchpad/shared";
import { Router } from "express";
import { sessionOf } from "../lib/session.js";

export const meRouter = Router();

// The shared schema picks the fields, so a password hash or a token on the session cannot leave
// through this route.
meRouter.get("/", (_req, res) => {
  const { user } = sessionOf(res);
  res.json(meResponse.parse({ user }));
});
