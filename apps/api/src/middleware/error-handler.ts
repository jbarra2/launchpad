import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { badRequest, conflict, HttpError, notFound } from "../errors/http-error.js";
import { Prisma } from "../generated/prisma/client.js";

const NOTHING_HERE = "Nothing was found at that address.";

// A route that does not exist. The sentence never repeats the address that was asked for.
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: NOTHING_HERE });
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

const INVALID = "Some of what you entered is not valid. Check it and try again.";

/** The Postgres error code under a Prisma error, such as 23514 for a failed check. */
function postgresCode(err: Prisma.PrismaClientKnownRequestError): unknown {
  const meta = err.meta as
    { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode;
}

// A refusal from the database that a route did not catch itself, by Prisma's code: a value over a
// cap or a missing one (P2000, P2011); a duplicate or two writes that collided (P2002, P2034); a row
// that is gone (P2003, P2025). P2039 is Prisma's code for any other database error, so only a failed
// check (23514) under it is the person's input; the rest stay a fault on our side. Prisma's own
// message and its `meta` can hold the row that was refused, so neither is ever sent or logged.
function databaseRefusal(err: unknown): HttpError | undefined {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }
  switch (err.code) {
    case "P2000":
    case "P2011":
      return badRequest(INVALID);
    case "P2039":
      return postgresCode(err) === "23514" ? badRequest(INVALID) : undefined;
    case "P2002":
    case "P2034":
      return conflict("That changed while you were saving. Reload the page and try again.");
    case "P2003":
    case "P2025":
      return notFound("That is no longer there. Reload the page.");
    default:
      return undefined;
  }
}

// Every error leaves here as `{ error }`, a sentence a person can act on. Zod adds `details`.
// Never send an error's own message, an issue object, or a stack.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  // An address with a broken escape, such as /api/rockets/%E0, names nothing. The router throws a
  // URIError while it reads the address, before any route runs.
  if (err instanceof URIError) {
    res.status(404).json({ error: NOTHING_HERE });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const refusal = databaseRefusal(err);
  if (refusal) {
    res.status(refusal.status).json({ error: refusal.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: INVALID,
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
