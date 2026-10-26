import type { RequestHandler } from "express";
import { HttpError } from "../errors/http-error.js";

export const MAX_BODY_BYTES = 32 * 1024;
export const TOO_MUCH = "That is too much to send at once. Shorten it and try again.";

// Better Auth reads a whole body before it looks at anything in it, and the JSON parser's own limit
// is not in front of it. This refuses a body that declares more than the limit, and one that
// declares no length at all, before Better Auth reads a byte. The web app's requests always carry
// their length, and Next passes it on.
export function limitBodySize(maxBytes: number = MAX_BODY_BYTES): RequestHandler {
  return (req, _res, next) => {
    if (req.headers["transfer-encoding"] !== undefined) {
      throw new HttpError(411, "That request has no length. Send it from the Launchpad web app.");
    }
    const declared = Number(req.headers["content-length"] ?? 0);
    if (!Number.isFinite(declared) || declared > maxBytes) {
      throw new HttpError(413, TOO_MUCH);
    }
    next();
  };
}
