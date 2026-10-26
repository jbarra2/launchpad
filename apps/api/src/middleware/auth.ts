import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { forbidden, notFound, unauthorized } from "../errors/http-error.js";
import { auth, CLIENT_IP_HEADER, trustedOrigin } from "../lib/auth.js";
import { isListedAuthPath } from "../lib/auth-guards.js";

/**
 * Mounted on /api/auth. A path the app does not list is a 404 here, before Better Auth sees it, so
 * it costs no database work. The same list is checked again inside Better Auth's own hook.
 */
export const refuseUnlistedAuthPath: RequestHandler = (req, _res, next) => {
  // /api/auth on its own is not an auth route. It goes on to the session check like any other path.
  if (req.path === "/") {
    next();
    return;
  }
  if (!isListedAuthPath(req.path)) {
    throw notFound("Nothing was found at that address.");
  }
  next();
};

/**
 * Better Auth counts rate limits by the address in a header of ours. Express works the address out
 * from `trust proxy`, and any copy of the header that the client sent is thrown away first, so a
 * client cannot choose its own address.
 */
export const forwardClientIp: RequestHandler = (req, _res, next) => {
  delete req.headers[CLIENT_IP_HEADER];
  if (req.ip) {
    req.headers[CLIENT_IP_HEADER] = req.ip;
  }
  next();
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** A second guard behind SameSite=Lax: a change that carries a cookie must come from the web app. */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.get("sec-fetch-site") === "cross-site") {
    throw forbidden("Requests from other sites are not accepted.");
  }
  const origin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
  if (!origin) {
    if (req.get("cookie")) {
      throw forbidden("Send changes from the Launchpad web app.");
    }
    next();
    return;
  }
  if (origin !== trustedOrigin) {
    throw forbidden("Requests from other sites are not accepted.");
  }
  next();
};

/**
 * Every route under /api needs a session. Better Auth renews a session that is past `updateAge`,
 * and the new cookie goes out on this response.
 */
export const requireSession: RequestHandler = async (req, res, next) => {
  const { headers, response } = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    res.append("Set-Cookie", cookie);
  }
  if (!response) {
    throw unauthorized("Sign in to continue.");
  }
  res.locals.auth = response;
  next();
};
