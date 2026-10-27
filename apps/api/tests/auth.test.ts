import http from "node:http";
import type { AddressInfo } from "node:net";
import { VERIFIED_LANDING } from "@launchpad/shared";
import { describe, expect, it } from "vitest";
import { auth } from "../src/lib/auth.js";
import { authLog } from "../src/lib/auth-log.js";
import { outbox } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import {
  PASSWORD,
  WEB_ORIGIN,
  cookieFrom,
  createVerifiedUser,
  get,
  mailsFor,
  app,
  pathOf,
  post,
  resetTokenOf,
  signIn,
  signUp,
} from "./helpers/auth.js";

describe("sign-up", () => {
  it("sends a verification link and creates no session", async () => {
    const response = await signUp("ana@example.com");
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(user.emailVerified).toBe(false);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ kind: "email-verification", to: "ana@example.com" });
  });

  it("mails a link on the web origin, so it reaches the API through the rewrite", async () => {
    await signUp("ana@example.com");
    const url = new URL(outbox[0]!.url);
    expect(url.origin).toBe(WEB_ORIGIN);
    expect(url.pathname).toBe("/api/auth/verify-email");
    expect(url.searchParams.get("token")).toBeTruthy();
  });

  it("answers a repeated sign-up like a new one, so it does not reveal who has an account", async () => {
    const first = await signUp("ana@example.com", { name: "Ana", password: PASSWORD });
    const second = await signUp("ana@example.com", {
      name: "Someone Else",
      password: "another-long-password",
    });
    expect(second.status).toBe(first.status);
    expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(Object.keys(second.body.user ?? {}).sort()).toEqual(
      Object.keys(first.body.user ?? {}).sort(),
    );
    expect(second.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
    // The first password still works, and the second attempt changed nothing.
    const mail = mailsFor("ana@example.com", "email-verification")[0]!;
    await get(pathOf(mail));
    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(200);
    expect((await signIn("ana@example.com", "another-long-password")).status).toBe(401);
  });

  it.each([
    ["a password of 11 characters", { password: "p".repeat(11) }],
    ["a password of 129 characters", { password: "p".repeat(129) }],
    ["a name over 80 characters", { name: "n".repeat(81) }],
    ["an empty name", { name: "   " }],
    [
      "an email over 254 characters",
      { email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com` },
    ],
    ["an address that is not an email", { email: "not an email" }],
  ])("refuses %s and creates nobody", async (_label, change) => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
      callbackURL: VERIFIED_LANDING,
      ...change,
    });
    expect(response.status).toBe(400);
    expect(typeof response.body.message).toBe("string");
    expect(await prisma.user.count()).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("refuses a request from another site", async () => {
    const response = await post(
      "/api/auth/sign-up/email",
      { name: "Ana", email: "ana@example.com", password: PASSWORD, callbackURL: VERIFIED_LANDING },
      { origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });

  it("allows 5 sign-ups from one address in 15 minutes and then answers 429", async () => {
    for (let i = 1; i <= 5; i += 1) {
      expect((await signUp(`person${i}@example.com`)).status).toBe(200);
    }
    const sixth = await signUp("person6@example.com");
    expect(sixth.status).toBe(429);
    expect(await prisma.user.count()).toBe(5);
  });
});

describe("what sign-up accepts", () => {
  it("refuses a field the form does not have, and stores nothing from it", async () => {
    const response = await post("/api/auth/sign-up/email", {
      name: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
      callbackURL: VERIFIED_LANDING,
      image: "i".repeat(10_000),
    });
    expect(response.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("stores a name without the spaces around it, so padding cannot get past the cap", async () => {
    const padded = `${" ".repeat(5_000)}Ana${" ".repeat(5_000)}`;
    const response = await post("/api/auth/sign-up/email", {
      name: padded,
      email: "  Ana@Example.com  ",
      password: PASSWORD,
      callbackURL: VERIFIED_LANDING,
    });
    // The body cap is 32 kb, and this one is about 10 kb.
    expect(response.status).toBe(200);
    const user = await prisma.user.findFirstOrThrow();
    expect(user.name).toBe("Ana");
    expect(user.email).toBe("ana@example.com");
  });

  it("answers two sign-ups for one new address at the same moment alike, and makes one account", async () => {
    // Without a lock the second insert hits the unique index, and the error would tell the caller
    // that the address had no account until then.
    const [one, two] = await Promise.all([
      signUp("race@example.com", { name: "One" }),
      signUp("race@example.com", { name: "Two" }),
    ]);
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(Object.keys(two.body.user).sort()).toEqual(Object.keys(one.body.user).sort());
    expect(await prisma.user.count()).toBe(1);
    expect(mailsFor("race@example.com", "email-verification")).toHaveLength(1);
  });
});

describe("how big a request may be", () => {
  it("refuses an auth request over 32 kb before anything reads it", async () => {
    const response = await post("/api/auth/sign-in/email", {
      email: "ana@example.com",
      password: PASSWORD,
      junk: "x".repeat(40_000),
    });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "That is too much to send at once. Shorten it and try again.",
    });
  });

  it("refuses an auth request that declares no length", async () => {
    const server = http.createServer(app).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            port,
            method: "POST",
            path: "/api/auth/sign-in/email",
            headers: {
              "content-type": "application/json",
              "transfer-encoding": "chunked",
              origin: WEB_ORIGIN,
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.write('{"email":"ana@example.com",');
        req.end('"password":"x"}');
      });
      expect(status).toBe(411);
    } finally {
      server.close();
    }
  });
});

describe("verifying the address", () => {
  it("verifies the address and sends the person on to sign in, without signing anyone in", async () => {
    await signUp("ana@example.com");
    const mail = outbox[0]!;
    // The browser sends the web origin's path, and Next passes it on to the API unchanged.
    expect(new URL(mail.url).origin).toBe(WEB_ORIGIN);
    const response = await get(pathOf(mail));
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(VERIFIED_LANDING);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(user.emailVerified).toBe(true);
    expect(await prisma.session.count()).toBe(0);
    // The password they chose now works.
    const login = await signIn("ana@example.com");
    expect(login.status).toBe(200);
    expect((await get("/api/me", { cookie: cookieFrom(login) })).body.user.email).toBe(
      "ana@example.com",
    );
  });

  it("does not swap the session a browser already has for the account a link names", async () => {
    // A link on another page can send a visitor to this address. If it signed in, the visitor would
    // end up in the account of whoever planted it, and save their own work there.
    const visitor = await createVerifiedUser("visitor@example.com", "Visitor");
    await signUp("planter@example.com", { name: "Planter" });
    const planted = mailsFor("planter@example.com", "email-verification")[0]!;
    const response = await get(pathOf(planted), { cookie: visitor.cookie });
    expect(response.headers["set-cookie"]).toBeUndefined();
    const me = await get("/api/me", { cookie: visitor.cookie });
    expect(me.body.user.email).toBe("visitor@example.com");
  });

  it("gives nobody a session when someone else's squatted account is verified by its real owner", async () => {
    // Mallory signs up with Victim's address and a password of her own. Victim follows the link.
    await signUp("victim@example.com", { name: "Mallory", password: "mallorys-own-password" });
    const link = mailsFor("victim@example.com", "email-verification")[0]!;
    const response = await get(pathOf(link));
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("refuses a link whose token was changed", async () => {
    await signUp("ana@example.com");
    const url = new URL(outbox[0]!.url);
    url.searchParams.set("token", `${url.searchParams.get("token")}x`);
    const response = await get(url.pathname + url.search);
    expect(response.headers["set-cookie"]).toBeUndefined();
    // The sign-in page keys its message on this code, so a change in Better Auth shows up here.
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/sign-in?notice=verified&error=INVALID_TOKEN");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(user.emailVerified).toBe(false);
  });
});

describe("asking for the link again", () => {
  function resend(email: string) {
    return post("/api/auth/send-verification-email", {
      email,
      callbackURL: "/sign-in?notice=verified",
    });
  }

  it("mails a new link to an address that is not verified yet", async () => {
    await signUp("ana@example.com");
    const response = await resend("ana@example.com");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });
    const links = mailsFor("ana@example.com", "email-verification");
    expect(links).toHaveLength(2);
    expect(new URL(links[1]!.url).searchParams.get("callbackURL")).toBe("/sign-in?notice=verified");
  });

  it("answers an unknown address and a verified one the same way, and mails neither", async () => {
    await createVerifiedUser("ben@example.com");
    const sentBefore = outbox.length;
    const unknown = await resend("nobody@example.com");
    const verified = await resend("ben@example.com");
    expect(unknown.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(unknown.body).toEqual(verified.body);
    expect(unknown.body).toEqual({ status: true });
    expect(outbox).toHaveLength(sentBefore);
  });

  it("refuses a landing place that leaves the site", async () => {
    await signUp("ana@example.com");
    const response = await post("/api/auth/send-verification-email", {
      email: "ana@example.com",
      callbackURL: "/\t/evil.example",
    });
    // Better Auth's own check of callback addresses answers first. The shared schema is the second
    // line, and refuses the same value (packages/shared/tests/auth.test.ts).
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("INVALID_CALLBACK_URL");
    expect(mailsFor("ana@example.com", "email-verification")).toHaveLength(1);
  });

  it("refuses what only the shared schema catches: a dot segment, an extra field, a long address", async () => {
    await signUp("ana@example.com");
    for (const body of [
      // Better Auth accepts this one, so the shared schema is what stops it.
      { email: "ana@example.com", callbackURL: "/.//evil.example" },
      { email: "ana@example.com", callbackURL: "/sign-in?notice=verified", extra: "field" },
      { email: `${"a".repeat(250)}@example.com`, callbackURL: VERIFIED_LANDING },
    ]) {
      const response = await post("/api/auth/send-verification-email", body);
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(response.body.code).toBe("INVALID_INPUT");
    }
    expect(mailsFor("ana@example.com", "email-verification")).toHaveLength(1);
  });

  it("refuses a landing page inside the site that is not the sign-in page, or none", async () => {
    await signUp("ana@example.com");
    // With none, Better Auth would mail a link to "/", which the API then refuses.
    for (const body of [
      { email: "ana@example.com", callbackURL: "/pad" },
      { email: "ana@example.com" },
    ]) {
      const response = await post("/api/auth/send-verification-email", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe("INVALID_INPUT");
    }
    expect(mailsFor("ana@example.com", "email-verification")).toHaveLength(1);
  });

  it("allows 3 requests from one address in 15 minutes and then answers 429", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await resend("nobody@example.com")).status).toBe(200);
    }
    const refused = await resend("nobody@example.com");
    expect(refused.status).toBe(429);
    // The app's own 15-minute window, not Better Auth's built-in one of 60 seconds.
    expect(Number(refused.headers["x-retry-after"])).toBeGreaterThan(60);
  });
});

describe("the session check", () => {
  it("is never rate limited, because every page the web server renders asks it from one address", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    for (let i = 0; i < 110; i += 1) {
      const response = await get("/api/auth/get-session", { cookie });
      expect(response.status).toBe(200);
    }
  });
});

describe("sign-in", () => {
  it("refuses an account that is not verified and sends the link again", async () => {
    await signUp("ana@example.com");
    expect(mailsFor("ana@example.com")).toHaveLength(1);
    const response = await signIn("ana@example.com");
    expect(response.status).toBe(403);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
    const mails = mailsFor("ana@example.com", "email-verification");
    expect(mails).toHaveLength(2);
    // The link that sign-in mails again works, and lands on the sign-in page.
    const opened = await get(pathOf(mails[1]!));
    expect(opened.status).toBe(302);
    expect(opened.headers.location).toBe(VERIFIED_LANDING);
  });

  it("answers a wrong password and an unknown email the same way", async () => {
    await createVerifiedUser("ana@example.com");
    const wrongPassword = await signIn("ana@example.com", "not-the-right-password");
    const unknownEmail = await signIn("nobody@example.com");
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it("signs a verified person in, with a cookie a script cannot read and no token in the body", async () => {
    await createVerifiedUser("ana@example.com");
    const response = await signIn("ana@example.com");
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("ana@example.com");
    expect(JSON.stringify(response.body)).not.toMatch(/"token"/i);
    const cookies = ([] as string[]).concat(response.headers["set-cookie"] ?? []);
    const session = cookies.find((cookie) => cookie.includes("session_token"));
    expect(session).toBeDefined();
    expect(session!.startsWith("launchpad.")).toBe(true);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).not.toMatch(/;\s*Secure/i);
  });

  it("returns no token from the session check either", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    const response = await get("/api/auth/get-session", { cookie });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("ana@example.com");
    expect(JSON.stringify(response.body)).not.toMatch(/"token"/i);
  });

  it("sends Better Auth's own log lines through authLog, which leaves error details out", () => {
    expect(auth.options.logger?.log).toBe(authLog);
  });

  it("keeps a session for 24 hours, renewed after an hour, with no cached copy", () => {
    expect(auth.options.session).toMatchObject({
      expiresIn: 24 * 60 * 60,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    });
    expect(auth.options.advanced?.useSecureCookies).toBe(false);
  });
});

describe("password reset", () => {
  it("answers a request the same for a known and an unknown address, and mails only the known one", async () => {
    await createVerifiedUser("ana@example.com");
    outbox.length = 0;
    const known = await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const unknown = await post("/api/auth/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(mailsFor("ana@example.com", "password-reset")).toHaveLength(1);
    expect(mailsFor("nobody@example.com")).toHaveLength(0);
  });

  it("sets a new password and ends every older session", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const mail = mailsFor("ana@example.com", "password-reset")[0]!;
    const newPassword = "a-brand-new-password";
    const reset = await post("/api/auth/reset-password", {
      token: resetTokenOf(mail),
      newPassword,
    });
    expect(reset.status).toBe(200);
    expect((await get("/api/me", { cookie })).status).toBe(401);
    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(401);
    expect((await signIn("ana@example.com", newPassword)).status).toBe(200);
  });

  it("works for an account that never verified its address, and counts as proof of the mailbox", async () => {
    await signUp("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const mail = mailsFor("ana@example.com", "password-reset")[0]!;
    expect(mail).toBeDefined();
    const reset = await post("/api/auth/reset-password", {
      token: resetTokenOf(mail),
      newPassword: "a-brand-new-password",
    });
    expect(reset.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(user.emailVerified).toBe(true);
    expect((await signIn("ana@example.com", "a-brand-new-password")).status).toBe(200);
  });

  it("accepts a link only once", async () => {
    await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const token = resetTokenOf(mailsFor("ana@example.com", "password-reset")[0]!);
    expect(
      (await post("/api/auth/reset-password", { token, newPassword: "first-new-password" })).status,
    ).toBe(200);
    const again = await post("/api/auth/reset-password", {
      token,
      newPassword: "second-new-password",
    });
    expect(again.status).toBe(400);
    expect((await signIn("ana@example.com", "second-new-password")).status).toBe(401);
  });

  it("refuses a new password that is too short and keeps the link usable", async () => {
    await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const token = resetTokenOf(mailsFor("ana@example.com", "password-reset")[0]!);
    const short = await post("/api/auth/reset-password", { token, newPassword: "short" });
    expect(short.status).toBe(400);
    expect(
      (await post("/api/auth/reset-password", { token, newPassword: "long-enough-password" }))
        .status,
    ).toBe(200);
  });

  it("refuses a link that has expired", async () => {
    await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const token = resetTokenOf(mailsFor("ana@example.com", "password-reset")[0]!);
    await prisma.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 60_000) } });
    const response = await post("/api/auth/reset-password", {
      token,
      newPassword: "long-enough-password",
    });
    expect(response.status).toBe(400);
    expect((await signIn("ana@example.com", "long-enough-password")).status).toBe(401);
  });

  it("ignores an address header that the client sends itself", async () => {
    // Better Auth counts by the address in this header. A client that could set it would get a
    // new count with every request.
    const attempt = (claimed: string) =>
      post("/api/auth/request-password-reset", {
        email: "ana@example.com",
        redirectTo: "/reset-password",
      }).set("x-launchpad-client-ip", claimed);
    expect((await attempt("198.51.100.1")).status).toBe(200);
    expect((await attempt("198.51.100.2")).status).toBe(200);
    expect((await attempt("198.51.100.3")).status).toBe(200);
    expect((await attempt("198.51.100.4")).status).toBe(429);
  });

  it("limits requests to 3 in 15 minutes, and a forged X-Forwarded-For does not buy more", async () => {
    // One proxy is in front of the API, so the last address in the header is the one it saw.
    // Whatever a client puts in front of that is its own claim and must not change the count.
    const attempt = (leading: string) =>
      post(
        "/api/auth/request-password-reset",
        { email: "ana@example.com", redirectTo: "/reset-password" },
        { forwardedFor: `${leading}, 203.0.113.7` },
      );
    expect((await attempt("198.51.100.1")).status).toBe(200);
    expect((await attempt("198.51.100.2")).status).toBe(200);
    expect((await attempt("198.51.100.3")).status).toBe(200);
    expect((await attempt("198.51.100.4")).status).toBe(429);
    // A different last address is a different caller.
    const other = await post(
      "/api/auth/request-password-reset",
      { email: "ana@example.com", redirectTo: "/reset-password" },
      { forwardedFor: "198.51.100.1, 203.0.113.99" },
    );
    expect(other.status).toBe(200);
  });
});

describe("deleting the account", () => {
  it("refuses a request with no password, or the wrong one, and keeps everything", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    const none = await post("/api/auth/delete-user", {}, { cookie });
    const wrong = await post(
      "/api/auth/delete-user",
      { password: "not-the-right-password" },
      { cookie },
    );
    expect(none.status).toBe(400);
    expect(none.body.message).toBe("Enter your password.");
    expect(wrong.status).toBe(400);
    expect(await prisma.user.count()).toBe(1);
    expect((await get("/api/me", { cookie })).status).toBe(200);
  });

  it("refuses a request that is not signed in", async () => {
    await createVerifiedUser("ana@example.com");
    const response = await post("/api/auth/delete-user", { password: PASSWORD });
    expect(response.status).toBe(401);
    expect(await prisma.user.count()).toBe(1);
  });

  it("removes the person and everything under them, and nobody else's data", async () => {
    const ana = await createVerifiedUser("ana@example.com", "Ana");
    const ben = await createVerifiedUser("ben@example.com", "Ben");
    // A reset request leaves a token row that has no foreign key to the user.
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    expect(await prisma.verification.count({ where: { value: ana.userId } })).toBeGreaterThan(0);

    const response = await post(
      "/api/auth/delete-user",
      { password: PASSWORD },
      { cookie: ana.cookie },
    );
    expect(response.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: ana.userId } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: ana.userId } })).toBe(0);
    expect(await prisma.verification.count({ where: { value: ana.userId } })).toBe(0);
    expect((await get("/api/me", { cookie: ana.cookie })).status).toBe(401);

    expect(await prisma.user.count({ where: { id: ben.userId } })).toBe(1);
    expect(await prisma.account.count({ where: { userId: ben.userId } })).toBe(1);
    expect((await get("/api/me", { cookie: ben.cookie })).status).toBe(200);
  });

  it("allows 3 attempts in 15 minutes and then answers 429", async () => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await post("/api/auth/delete-user", { password: "wrong-password-here" }, { cookie }))
          .status,
      ).toBe(400);
    }
    const fourth = await post("/api/auth/delete-user", { password: PASSWORD }, { cookie });
    expect(fourth.status).toBe(429);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("the reset link", () => {
  it("is refused when the request names no page for it to land on, or a page that is not the reset page", async () => {
    await createVerifiedUser("ana@example.com");
    outbox.length = 0;
    const none = await post("/api/auth/request-password-reset", { email: "ana@example.com" });
    const elsewhere = await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/pad",
    });
    expect(none.status).toBe(400);
    expect(elsewhere.status).toBe(400);
    expect(mailsFor("ana@example.com", "password-reset")).toHaveLength(0);
  });

  it("lands on the reset page with the token when it is followed", async () => {
    await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const mail = mailsFor("ana@example.com", "password-reset")[0]!;
    expect(new URL(mail.url).origin).toBe(WEB_ORIGIN);
    const response = await get(pathOf(mail));
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${WEB_ORIGIN}/reset-password?token=${resetTokenOf(mail)}`,
    );
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("is refused when it names any other landing page, before it can redirect", async () => {
    await createVerifiedUser("ana@example.com");
    await post("/api/auth/request-password-reset", {
      email: "ana@example.com",
      redirectTo: "/reset-password",
    });
    const token = resetTokenOf(mailsFor("ana@example.com", "password-reset")[0]!);
    for (const callbackURL of ["/.//evil.example", "/pad", "/reset-password?x=1"]) {
      const response = await get(
        `/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(callbackURL)}`,
      );
      expect(response.status, callbackURL).toBeGreaterThanOrEqual(400);
      expect(response.status, callbackURL).toBeLessThan(500);
      expect(response.headers.location, callbackURL).toBeUndefined();
    }
  });
});

describe("a verification link someone else wrote", () => {
  it("cannot send a person to another site, or anywhere but sign-in, when it fails", async () => {
    // Better Auth's own check lets the first three through, and it folds each into "//evil.example"
    // when it adds the error to a failed link.
    for (const callbackURL of [
      "/.//evil.example",
      "/%2e//evil.example",
      "/x/..//evil.example%2Flogin",
      "/pad",
      "//evil.example",
    ]) {
      const response = await get(
        `/api/auth/verify-email?token=made-up&callbackURL=${encodeURIComponent(callbackURL)}`,
      );
      expect(response.status, callbackURL).toBeGreaterThanOrEqual(400);
      expect(response.status, callbackURL).toBeLessThan(500);
      expect(response.headers.location, callbackURL).toBeUndefined();
    }
  });

  it("still sends a failed link with the real landing page back to sign in, with the reason", async () => {
    const response = await get(
      `/api/auth/verify-email?token=made-up&callbackURL=${encodeURIComponent(VERIFIED_LANDING)}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/sign-in?notice=verified&error=INVALID_TOKEN");
  });
});

describe("a path the app does not list", () => {
  it("is refused before Better Auth looks at it, so it costs no rate-limit row", async () => {
    for (let i = 0; i < 6; i += 1) {
      const response = await get(`/api/auth/no-such-path-${i}`);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Nothing was found at that address." });
    }
    expect(await prisma.rateLimit.count()).toBe(0);
  });

  it("is never counted toward a limit, so it cannot lock out a real request", async () => {
    for (let i = 0; i < 30; i += 1) {
      await get("/api/auth/no-such-path");
    }
    const response = await signIn("nobody@example.com");
    expect(response.status).toBe(401);
  });

  it("leaves the limiter working for a path that is listed", async () => {
    await signIn("nobody@example.com");
    expect(await prisma.rateLimit.count()).toBeGreaterThan(0);
  });
});

describe("the auth router refuses what the app does not use", () => {
  it.each([
    ["POST", "/api/auth/change-password"],
    ["POST", "/api/auth/change-email"],
    ["POST", "/api/auth/update-user"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-session"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/revoke-other-sessions"],
    ["POST", "/api/auth/sign-in/social"],
    ["POST", "/api/auth/link-social"],
    ["POST", "/api/auth/unlink-account"],
    ["GET", "/api/auth/account-info"],
    ["POST", "/api/auth/verify-password"],
    ["GET", "/api/auth/ok"],
    ["GET", "/api/auth/error"],
  ])("answers %s %s with 404, even for a signed-in person", async (method, path) => {
    const { cookie } = await createVerifiedUser("ana@example.com");
    const response =
      method === "GET" ? await get(path, { cookie }) : await post(path, {}, { cookie });
    expect(response.status).toBe(404);
  });
});
