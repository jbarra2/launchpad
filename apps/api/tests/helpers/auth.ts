import { VERIFIED_LANDING } from "@launchpad/shared";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { outbox, type Mail, type MailKind } from "../../src/lib/mailer.js";
import { prisma } from "../../src/lib/prisma.js";

export const WEB_ORIGIN = "http://localhost:3100";
// Made up, and only ever used by these tests.
export const PASSWORD = "Correct-horse-battery-9"; // public-check: allow secret
export const app = createApp();

interface Options {
  cookie?: string;
  /** `null` sends no Origin header at all. */
  origin?: string | null;
  forwardedFor?: string;
}

export function post(path: string, body: Record<string, unknown>, options: Options = {}) {
  return change("post", path, body, options);
}

export function put(path: string, body: Record<string, unknown>, options: Options = {}) {
  return change("put", path, body, options);
}

export function del(path: string, options: Options = {}) {
  return change("delete", path, undefined, options);
}

/** A request that changes something, sent from the web app's origin unless the test says not. */
function change(
  method: "post" | "put" | "delete",
  path: string,
  body: Record<string, unknown> | undefined,
  options: Options,
) {
  const req = request(app)[method](path);
  if (body !== undefined) {
    req.send(body);
  }
  if (options.origin !== null) {
    req.set("Origin", options.origin ?? WEB_ORIGIN);
  }
  if (options.cookie) {
    req.set("Cookie", options.cookie);
  }
  if (options.forwardedFor) {
    req.set("X-Forwarded-For", options.forwardedFor);
  }
  return req;
}

export function get(path: string, options: Pick<Options, "cookie" | "forwardedFor"> = {}) {
  const req = request(app).get(path);
  if (options.cookie) {
    req.set("Cookie", options.cookie);
  }
  if (options.forwardedFor) {
    req.set("X-Forwarded-For", options.forwardedFor);
  }
  return req;
}

/** The cookies a response sets, in the form a browser sends them back. */
export function cookieFrom(response: request.Response): string {
  const header = response.headers["set-cookie"] as string[] | string | undefined;
  return ([] as string[])
    .concat(header ?? [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export function signUp(email: string, options: { name?: string; password?: string } = {}) {
  return post("/api/auth/sign-up/email", {
    name: options.name ?? "Ana",
    email,
    password: options.password ?? PASSWORD,
    // Following the link verifies the address and sends the person on to the sign-in screen.
    callbackURL: VERIFIED_LANDING,
  });
}

export function signIn(email: string, password = PASSWORD) {
  // The landing page of the link that sign-in mails again to an address that is not verified.
  return post("/api/auth/sign-in/email", { email, password, callbackURL: VERIFIED_LANDING });
}

export function mailsFor(email: string, kind?: MailKind): Mail[] {
  return outbox.filter((mail) => mail.to === email && (!kind || mail.kind === kind));
}

/** The path and query of a mailed link, which is what a browser sends once Next passes it on. */
export function pathOf(mail: Mail): string {
  const url = new URL(mail.url);
  return url.pathname + url.search;
}

/** Signs up, follows the mailed link, signs in, and returns the session cookie. */
export async function createVerifiedUser(email: string, name = "Ana") {
  await signUp(email, { name });
  const mail = mailsFor(email, "email-verification").at(-1);
  if (!mail) {
    throw new Error("no verification link was mailed");
  }
  await get(pathOf(mail));
  const login = await signIn(email);
  if (login.status !== 200) {
    throw new Error(`the new account could not sign in (${login.status})`);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { cookie: cookieFrom(login), userId: user.id, email };
}

/** The reset token inside a mailed reset link. */
export function resetTokenOf(mail: Mail): string {
  const token = new URL(mail.url).pathname.split("/").at(-1);
  if (!token) {
    throw new Error("the reset link has no token");
  }
  return token;
}
