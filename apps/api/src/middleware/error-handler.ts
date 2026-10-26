import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors/http-error.js";

// A route that does not exist. The sentence never repeats the address that was asked for.
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Nothing was found at that address." });
};

// What the log gets for an error nobody planned for: its class and its code, and nothing else. The
// message and the stack can carry a connection string, a key, or a person's text.
function describeForLog(err: unknown): string {
  if (!(err instanceof Error)) {
    return typeof err;
  }
  const code = "code" in err && typeof err.code === "string" ? ` (${err.code})` : "";
  return `${err.name}${code}`;
}

// Every error leaves here as `{ error }`, a sentence a person can act on. Zod adds `details`.
// Never send an error's own message, an issue object, or a stack.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Some of what you entered is not valid. Check it and try again.",
      details: err.issues.slice(0, 8).map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
    return;
  }

  console.error(`Unexpected error: ${describeForLog(err)}`);
  res.status(500).json({ error: "Something went wrong on our side. Try again in a moment." });
};
