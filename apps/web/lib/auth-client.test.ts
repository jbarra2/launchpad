import { beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_MESSAGE, TOO_MANY_MESSAGE, authErrorMessage, authPost } from "./auth-client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("authPost", () => {
  it("posts JSON to the auth route on this site and returns the body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "u1" } })));
    const result = await authPost("/sign-in/email", { email: "ana@example.com", password: "x" });
    expect(result).toEqual({ ok: true, data: { user: { id: "u1" } } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    // Better Auth reads a body only when it is labelled as JSON.
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "ana@example.com", password: "x" });
  });

  it("returns the status, code, and message of a refusal", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }),
        {
          status: 401,
        },
      ),
    );
    expect(await authPost("/sign-in/email", {})).toEqual({
      ok: false,
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
  });

  it("reports a network failure as status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await authPost("/sign-out", {})).toEqual({ ok: false, status: 0 });
  });
});

describe("authErrorMessage", () => {
  const fallback = "Something went wrong. Try again.";

  it("never shows Better Auth's own wording", () => {
    for (const [status, code, message] of [
      [401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password"],
      [403, "EMAIL_NOT_VERIFIED", "Email not verified"],
      [403, "INVALID_ORIGIN", "Invalid origin"],
      [400, "INVALID_TOKEN", "Invalid token"],
      [429, undefined, "Too many requests. Please try again later."],
      [404, undefined, "Nothing was found at that address."],
    ] as const) {
      const shown = authErrorMessage({ ok: false, status, code, message }, fallback);
      expect(shown).not.toBe(message);
    }
  });

  it("gives each answer a sentence that says what to do", () => {
    expect(authErrorMessage({ ok: false, status: 0 }, fallback)).toBe(NETWORK_MESSAGE);
    expect(authErrorMessage({ ok: false, status: 429 }, fallback)).toBe(TOO_MANY_MESSAGE);
    expect(
      authErrorMessage({ ok: false, status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, fallback),
    ).toBe(
      "We could not sign you in with that email and password. If you signed up recently, confirm your address with the newest link we emailed you.",
    );
    expect(authErrorMessage({ ok: false, status: 400, code: "INVALID_TOKEN" }, fallback)).toBe(
      "That reset link has expired or was already used. Ask for a new one.",
    );
    expect(authErrorMessage({ ok: false, status: 403, code: "INVALID_ORIGIN" }, fallback)).toBe(
      "Reload this page and try again.",
    );
    expect(authErrorMessage({ ok: false, status: 500 }, fallback)).toBe(fallback);
  });

  it("shows the shared schema's own sentence, which is written for people", () => {
    expect(
      authErrorMessage(
        {
          ok: false,
          status: 400,
          code: "INVALID_INPUT",
          message: "Use at least 12 characters for the password.",
        },
        fallback,
      ),
    ).toBe("Use at least 12 characters for the password.");
  });

  it("shows a schema message of up to 200 characters", () => {
    const message = "x".repeat(200);
    expect(
      authErrorMessage({ ok: false, status: 400, code: "INVALID_INPUT", message }, fallback),
    ).toBe(message);
  });

  it("does not show a schema message that is too long to be one of ours", () => {
    expect(
      authErrorMessage(
        { ok: false, status: 400, code: "INVALID_INPUT", message: "x".repeat(201) },
        fallback,
      ),
    ).toBe(fallback);
  });

  it("tells a person whose address is already confirmed to sign in", () => {
    expect(
      authErrorMessage({ ok: false, status: 400, code: "EMAIL_ALREADY_VERIFIED" }, fallback),
    ).toBe("That address is already confirmed. You can sign in.");
  });

  it("does not take a code from the prototype chain", () => {
    expect(authErrorMessage({ ok: false, status: 400, code: "toString" }, fallback)).toBe(fallback);
  });
});
