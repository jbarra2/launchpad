import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESET_PAGE, VERIFIED_LANDING } from "../packages/shared/src/auth.js";
import { WEB_ORIGIN, repoRoot, startStack, type Stack } from "./harness.js";

// The path a new person takes, through the built web app exactly as a browser reaches it: sign up,
// open the link from the console, sign in, and land on an empty pad.

let stack: Stack;
const email = "ana@example.com";
// Made up, and only ever used by this test.
const password = "Correct-horse-battery-9"; // public-check: allow secret

beforeAll(async () => {
  stack = await startStack();
});

afterAll(async () => {
  await stack?.stop();
});

function post(pathname: string, body: unknown, cookie?: string) {
  return fetch(`${WEB_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: WEB_ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

function get(pathOrUrl: string, cookie?: string) {
  return fetch(new URL(pathOrUrl, WEB_ORIGIN), {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
}

/** Where a redirect sends the browser, as a path and query. */
function target(response: Response): string {
  const url = new URL(response.headers.get("location") ?? "", WEB_ORIGIN);
  // A redirect to another host would otherwise pass on its path alone.
  expect(url.origin).toBe(WEB_ORIGIN);
  return url.pathname + url.search;
}

function sessionCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0]!)
    .find((pair) => pair.startsWith("launchpad.session_token="));
  if (!cookie) {
    throw new Error("No session cookie was set.");
  }
  return cookie;
}

describe("a new person", () => {
  let cookie = "";

  it("signs up and gets no session yet", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Ana",
      email,
      password,
      callbackURL: VERIFIED_LANDING,
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("opens the link from the console, which confirms the address and does not sign in", async () => {
    const link = await stack.mail("email-verification", email);
    expect(new URL(link).origin).toBe(WEB_ORIGIN);
    const response = await get(link);
    expect(response.status).toBe(302);
    expect(target(response)).toBe("/sign-in?notice=verified");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("signs in through the web app and gets a session cookie", async () => {
    // The same body the sign-in form sends.
    const response = await post("/api/auth/sign-in/email", {
      email,
      password,
      callbackURL: VERIFIED_LANDING,
    });
    expect(response.status).toBe(200);
    cookie = sessionCookieFrom(response);
  });

  it("lands on an empty pad", async () => {
    const response = await get("/pad", cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("The pad");
    expect(html).toContain("No ideas yet.");
  });

  it("sees only part of the address on Settings, and the full one is nowhere in the page", async () => {
    const response = await get("/settings", cookie);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("a•••@e•••.com");
    expect(html.toLowerCase()).not.toContain(email);
  });

  it("is sent on to the pad, not to another site, when signed in on the sign-in page", async () => {
    // The second one only becomes //evil.example once "." is resolved.
    for (const next of ["%2F%2Fevil.example", "%2F.%2F%2Fevil.example%2Flogin"]) {
      const response = await get(`/sign-in?next=${next}`, cookie);
      expect(response.status, next).toBe(307);
      expect(response.headers.get("location"), next).toBe("/pad");
    }
  });

  it("keeps the session going: an aged session comes back renewed", async () => {
    // Better Auth renews a session once it is an hour old. Two hours have "passed" here.
    await stack.db.session.updateMany({
      data: { expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000) },
    });
    const response = await get("/pad", cookie);
    expect(response.status).toBe(200);
    const renewed = response.headers
      .getSetCookie()
      .find((line) => line.startsWith("launchpad.session_token="));
    expect(renewed).toMatch(/Max-Age=86400/);
    const session = await stack.db.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("signs out, and the old cookie no longer opens the pad", async () => {
    const out = await post("/api/auth/sign-out", {}, cookie);
    expect(out.status).toBe(200);
    const response = await get("/pad", cookie);
    expect(response.status).toBe(307);
    expect(target(response)).toBe("/sign-in?next=%2Fpad");
    // The dead cookie is cleared on the way, so it is not checked again on every page.
    expect(
      response.headers.getSetCookie().some((line) => /^launchpad\.session_token=;/.test(line)),
    ).toBe(true);
  });
});

describe("someone who signs up with an address that already has an account", () => {
  it("sees the same answer as a new address, and the owner is sent a notice to sign in", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Someone Else",
      email,
      password: "Someone-elses-password-1", // public-check: allow secret
      callbackURL: VERIFIED_LANDING,
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    const link = await stack.mail("account-exists", email);
    expect(link).toBe(`${WEB_ORIGIN}/sign-in`);
  });
});

describe("a person who forgot their password", () => {
  const newPassword = "A-different-long-password-8"; // public-check: allow secret

  it("asks for a link, opens it, sets a new password, and signs in with only the new one", async () => {
    const forgot = await post("/api/auth/request-password-reset", {
      email,
      redirectTo: RESET_PAGE,
    });
    expect(forgot.status).toBe(200);

    const link = await stack.mail("password-reset", email);
    expect(new URL(link).origin).toBe(WEB_ORIGIN);
    const landing = await get(link);
    expect(landing.status).toBe(302);
    const resetPage = new URL(landing.headers.get("location") ?? "", WEB_ORIGIN);
    expect(resetPage.origin).toBe(WEB_ORIGIN);
    expect(resetPage.pathname).toBe(RESET_PAGE);
    const token = resetPage.searchParams.get("token") ?? "";
    expect(token).not.toBe("");

    const page = await get(resetPage.pathname + resetPage.search);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Type it again");

    // The password they already have is not a new one, and trying it leaves the link usable.
    const same = await post("/api/auth/reset-password", { token, newPassword: password });
    expect(same.status).toBe(400);
    expect(((await same.json()) as { code?: string }).code).toBe("PASSWORD_UNCHANGED");

    const reset = await post("/api/auth/reset-password", { token, newPassword });
    expect(reset.status).toBe(200);

    const old = await post("/api/auth/sign-in/email", {
      email,
      password,
      callbackURL: VERIFIED_LANDING,
    });
    expect(old.status).toBe(401);
    const fresh = await post("/api/auth/sign-in/email", {
      email,
      password: newPassword,
      callbackURL: VERIFIED_LANDING,
    });
    expect(fresh.status).toBe(200);
  });
});

describe("a verification link someone else wrote", () => {
  it("cannot send the person who opens it to another site", async () => {
    for (const callbackURL of ["/.//evil.example/sign-in", "/%2e//evil.example"]) {
      const response = await get(
        `/api/auth/verify-email?token=made-up&callbackURL=${encodeURIComponent(callbackURL)}`,
      );
      expect(response.status, callbackURL).toBe(400);
      expect(response.headers.get("location"), callbackURL).toBeNull();
    }
  });
});

describe("a visitor with no session", () => {
  it("is sent to sign in, with the pad to come back to", async () => {
    const response = await get("/pad");
    expect(response.status).toBe(307);
    expect(target(response)).toBe("/sign-in?next=%2Fpad");
  });

  it("can open every public page", async () => {
    for (const page of [
      "/",
      "/sign-up",
      "/sign-in",
      "/check-email",
      "/forgot-password",
      "/reset-password",
    ]) {
      const response = await get(page);
      expect(response.status, page).toBe(200);
    }
  });
});

describe("the built web app", () => {
  it("never puts the API's address in code sent to the browser", () => {
    const needle = new URL(stack.apiOrigin).host;
    const staticDir = path.join(repoRoot, "apps/web/.next/static");
    const files = fs.readdirSync(staticDir, { recursive: true, withFileTypes: true });
    const leaking = files
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => fs.readFileSync(file, "utf8").includes(needle));
    expect(leaking).toEqual([]);
  });
});
