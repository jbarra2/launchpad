import { VERIFIED_LANDING } from "@launchpad/shared";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUTH_PATHS,
  isListedAuthPath,
  validateAuthBody,
  withoutTokens,
} from "../src/lib/auth-guards.js";

describe("isListedAuthPath", () => {
  it.each([
    "/sign-up/email",
    "/sign-in/email",
    "/sign-out",
    "/get-session",
    "/verify-email",
    "/send-verification-email",
    "/request-password-reset",
    "/reset-password",
    "/delete-user",
    "/reset-password/abc123",
  ])("lists %s", (path) => {
    expect(isListedAuthPath(path)).toBe(true);
  });

  it.each([
    "/nonexistent",
    "/ok",
    "/error",
    "/change-password",
    "/sign-in/social",
    "/Sign-In/Email",
    "/sign-in/email/",
    "/sign-in/email/extra",
    "/reset-password/",
    "/reset-password/a/b",
    "/delete-user/callback",
    "//sign-in/email",
    "",
    "/",
  ])("does not list %j", (path) => {
    expect(isListedAuthPath(path)).toBe(false);
  });
});

describe("withoutTokens", () => {
  it("removes a token at any depth, in objects and in lists", () => {
    const body = {
      token: "a",
      user: { id: "u", token: "b" },
      session: { id: "s", token: "c", nested: { refreshToken: "d" } },
      sessions: [{ id: "1", token: "e" }, { id: "2" }],
    };
    expect(withoutTokens(body)).toEqual({
      user: { id: "u" },
      session: { id: "s", nested: {} },
      sessions: [{ id: "1" }, { id: "2" }],
    });
  });

  it("keeps everything else, dates included, and does not change what it was given", () => {
    const when = new Date("2026-10-26T12:00:00Z");
    const body = { ok: true, when, count: 3, nothing: null, token: "t" };
    const result = withoutTokens(body) as typeof body;
    expect(result.when).toBe(when);
    expect(result).toEqual({ ok: true, when, count: 3, nothing: null });
    expect(body.token).toBe("t");
  });

  it("leaves values that are not objects alone", () => {
    expect(withoutTokens("text")).toBe("text");
    expect(withoutTokens(null)).toBeNull();
    expect(withoutTokens(5)).toBe(5);
  });
});

describe("validateAuthBody", () => {
  it("passes a path that has no schema, and hands back the body as the schema read it", () => {
    expect(validateAuthBody("/sign-out", undefined, undefined)).toBeUndefined();
    expect(
      validateAuthBody(
        "/sign-in/email",
        { email: "  ana@example.com ", password: "whatever", callbackURL: VERIFIED_LANDING },
        undefined,
      ),
    ).toEqual({ email: "ana@example.com", password: "whatever", callbackURL: VERIFIED_LANDING });
  });

  it("trims a name, so padding cannot get past its cap", () => {
    const padded = `${" ".repeat(500)}Ana${" ".repeat(500)}`;
    expect(
      validateAuthBody(
        "/sign-up/email",
        {
          name: padded,
          email: "ana@example.com",
          password: "a-long-enough-password",
          callbackURL: VERIFIED_LANDING,
        },
        undefined,
      )?.name,
    ).toBe("Ana");
  });

  it("refuses a field that the schema does not list", () => {
    expect(() =>
      validateAuthBody(
        "/sign-in/email",
        {
          email: "ana@example.com",
          password: "x",
          callbackURL: VERIFIED_LANDING,
          rememberMe: false,
        },
        undefined,
      ),
    ).toThrow("Check what you entered and try again.");
  });

  it("refuses an invalid body with the first sentence from the shared schema", () => {
    expect(() =>
      validateAuthBody(
        "/sign-up/email",
        { name: "Ana", email: "ana@example.com", password: "short" },
        undefined,
      ),
    ).toThrow("Use at least 12 characters for the password.");
  });

  it("refuses a body that is not an object", () => {
    expect(() => validateAuthBody("/sign-in/email", "nope", undefined)).toThrow();
    expect(() => validateAuthBody("/delete-user", undefined, undefined)).toThrow();
  });

  it("takes a reset token from the query when the body has none", () => {
    expect(() =>
      validateAuthBody(
        "/reset-password",
        { newPassword: "a-long-enough-password" },
        { token: "abc" },
      ),
    ).not.toThrow();
    expect(() =>
      validateAuthBody("/reset-password", { newPassword: "a-long-enough-password" }, undefined),
    ).toThrow();
  });
});

describe("ALLOWED_AUTH_PATHS", () => {
  it("holds what the sign-in screens use and nothing that changes an account another way", () => {
    for (const path of [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-out",
      "/get-session",
      "/verify-email",
      "/delete-user",
    ]) {
      expect(ALLOWED_AUTH_PATHS.has(path)).toBe(true);
    }
    for (const path of [
      "/change-password",
      "/change-email",
      "/update-user",
      "/list-sessions",
      "/revoke-sessions",
      "/sign-in/social",
    ]) {
      expect(ALLOWED_AUTH_PATHS.has(path)).toBe(false);
    }
  });
});
