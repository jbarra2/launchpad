import type { Response } from "express";
import { unauthorized } from "../errors/http-error.js";
import type { AuthSession } from "./auth.js";

// The signed-in person comes from the session and from nothing else. No header, query value, or
// body field chooses whose data a request touches. A route reads the person here.
export function sessionOf(res: Response): AuthSession {
  const session = res.locals.auth as AuthSession | undefined;
  if (!session) {
    throw unauthorized("Sign in to continue.");
  }
  return session;
}
