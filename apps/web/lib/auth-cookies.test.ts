// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAMES, authCookieHeader, hasSessionCookie } from "./auth-cookies";

describe("SESSION_COOKIE_NAMES", () => {
  it("names the session cookie over http and over https", () => {
    expect(SESSION_COOKIE_NAMES).toEqual([
      "launchpad.session_token",
      "__Secure-launchpad.session_token",
    ]);
  });
});

describe("hasSessionCookie", () => {
  it("sees either session cookie with a value", () => {
    expect(hasSessionCookie("launchpad.session_token=abc.def")).toBe(true);
    expect(hasSessionCookie("theme=dark; __Secure-launchpad.session_token=abc")).toBe(true);
  });

  it("does not count a missing header, an empty value, or a look-alike name", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
    expect(hasSessionCookie("launchpad.session_token=")).toBe(false);
    expect(hasSessionCookie("xlaunchpad.session_token=abc")).toBe(false);
    expect(hasSessionCookie("launchpad.session_token_x=abc")).toBe(false);
    expect(hasSessionCookie("launchpad.session_data=abc")).toBe(false);
  });
});

describe("authCookieHeader", () => {
  it("keeps this app's cookies exactly as the browser sent them", () => {
    const header =
      "launchpad.session_token=a.b%3D; other=secret; __Secure-launchpad.session_token=c%2Fd";
    expect(authCookieHeader(header)).toBe(
      "launchpad.session_token=a.b%3D; __Secure-launchpad.session_token=c%2Fd",
    );
  });

  it("keeps the other cookies Better Auth sets under the same prefix", () => {
    expect(authCookieHeader("launchpad.dont_remember=x; launchpad.session_data=y")).toBe(
      "launchpad.dont_remember=x; launchpad.session_data=y",
    );
  });

  it("drops every other site's cookies, including look-alike names", () => {
    expect(
      authCookieHeader("other=secret; xlaunchpad.session_token=a; launchpadx.session_token=b"),
    ).toBe("");
    expect(authCookieHeader(null)).toBe("");
  });
});
