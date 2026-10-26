import express, { type RequestHandler } from "express";
import { badRequest, HttpError } from "../errors/http-error.js";

const parseJson = express.json({ limit: "32kb" });

const UNREADABLE = "That request could not be read. Try again.";

// The parser runs none of our code, so anything it refuses is a problem with what was sent: bad
// JSON, a body that is too big or in a form it cannot read, a compressed body that does not
// unpack, or an upload that stopped half way. None of it is a fault on our side, so none of it may
// reach the 500 branch of the error handler.
function refusal(err: unknown): HttpError {
  const type = typeof err === "object" && err !== null && "type" in err ? err.type : undefined;
  if (type === "entity.too.large") {
    return new HttpError(413, "That is too much to send at once. Shorten it and try again.");
  }
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return new HttpError(415, UNREADABLE);
  }
  return badRequest(UNREADABLE);
}

export const jsonBody: RequestHandler = (req, res, next) => {
  parseJson(req, res, (err?: unknown) => next(err ? refusal(err) : undefined));
};
