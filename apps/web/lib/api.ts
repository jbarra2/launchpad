import { headers } from "next/headers";
import { apiOrigin } from "./api-origin";
import { authCookieHeader } from "./auth-cookies";

const API_TIMEOUT_MS = 10_000;

/** The API could not be reached, or gave an answer the page cannot use. */
export class ApiUnavailableError extends Error {
  constructor() {
    super("The API could not be reached.");
    this.name = "ApiUnavailableError";
  }
}

/**
 * Server components call Express directly with the browser's own session cookie. Importing
 * next/headers keeps this file out of browser code, where it would fail the build.
 */
export async function apiFetch(path: `/api/${string}`): Promise<Response> {
  const origin = apiOrigin();
  const url = new URL(path, origin);
  // A path such as "//other.example/api" would point the call at another host.
  if (url.origin !== origin || !path.startsWith("/api/")) {
    throw new Error("apiFetch only calls the API.");
  }
  const cookie = authCookieHeader((await headers()).get("cookie"));
  try {
    return await fetch(url, {
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new ApiUnavailableError();
  }
}
