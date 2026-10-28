import { VERIFIED_LANDING } from "../packages/shared/src/auth.js";
import { WEB_ORIGIN, type Stack } from "./harness.js";

// Requests as a browser sends them to the web app: same origin, the session cookie, and redirects
// left for the test to read.

export function send(method: string, pathname: string, body?: unknown, cookie?: string) {
  return fetch(`${WEB_ORIGIN}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      origin: WEB_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

export function post(pathname: string, body: unknown, cookie?: string) {
  return send("POST", pathname, body, cookie);
}

export function get(pathOrUrl: string, cookie?: string) {
  return fetch(new URL(pathOrUrl, WEB_ORIGIN), {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
}

export function sessionCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0]!)
    .find((pair) => pair.startsWith("launchpad.session_token="));
  if (!cookie) {
    throw new Error("No session cookie was set.");
  }
  return cookie;
}

/** Signs up through the web app, opens the link from the console, signs in, and returns the cookie. */
export async function signedInPerson(
  stack: Stack,
  email: string,
  password: string,
  name = "Ana",
): Promise<string> {
  const signUp = await post("/api/auth/sign-up/email", {
    name,
    email,
    password,
    callbackURL: VERIFIED_LANDING,
  });
  if (signUp.status !== 200) {
    throw new Error(`Sign-up failed (${signUp.status}).`);
  }
  await get(await stack.mail("email-verification", email));
  const signIn = await post("/api/auth/sign-in/email", {
    email,
    password,
    callbackURL: VERIFIED_LANDING,
  });
  if (signIn.status !== 200) {
    throw new Error(`Sign-in failed (${signIn.status}).`);
  }
  return sessionCookieFrom(signIn);
}
