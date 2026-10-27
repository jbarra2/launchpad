// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AFTER_SIGN_IN, safeNextPath } from "./safe-path";

describe("safeNextPath", () => {
  it("keeps a page inside the site, with its query", () => {
    expect(safeNextPath("/pad")).toBe("/pad");
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/rockets/abc123?tab=plan")).toBe("/rockets/abc123?tab=plan");
    expect(safeNextPath("/")).toBe("/");
  });

  it("returns the address the browser would really open, never the raw input", () => {
    expect(safeNextPath("/pad/../settings")).toBe("/settings");
    expect(safeNextPath("/pad#plan")).toBe("/pad");
  });

  it("refuses anything that is not a single string", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    // ?next=/pad&next=//evil.example reaches a page as an array.
    expect(safeNextPath(["/pad", "//evil.example"])).toBeNull();
  });

  it("refuses an empty path and one over 200 characters", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(`/${"a".repeat(199)}`)).toBe(`/${"a".repeat(199)}`);
    expect(safeNextPath(`/${"a".repeat(200)}`)).toBeNull();
  });

  it("refuses control characters, spaces, and other characters outside printable ASCII", () => {
    // A browser drops tabs and line breaks, so these two would open //evil.example.
    expect(safeNextPath("/\t/evil.example")).toBeNull();
    expect(safeNextPath("/\n/evil.example")).toBeNull();
    expect(safeNextPath("/pad\u0001")).toBeNull();
    expect(safeNextPath("/pad\u007f")).toBeNull();
    expect(safeNextPath("/pad\u0085")).toBeNull();
    expect(safeNextPath(" /pad")).toBeNull();
    expect(safeNextPath("/ｐａｄ")).toBeNull();
  });

  it("refuses a backslash anywhere", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/pad\\x")).toBeNull();
  });

  it("refuses an address on another site or with a scheme", () => {
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("///evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("pad")).toBeNull();
  });

  it("refuses a path that the browser would fold into another site's address", () => {
    // Each passes a check of the raw text, and each becomes //evil.example once "." and ".." are
    // resolved, which a browser opens as another site.
    for (const path of [
      "/.//evil.example/login",
      "/..//evil.example",
      "/%2e//evil.example",
      "/%2E%2E//evil.example",
      "/pad/..//evil.example",
    ]) {
      expect(safeNextPath(path), path).toBeNull();
    }
    expect(safeNextPath("/pad/./settings")).toBe("/pad/settings");
  });

  it("refuses a path whose escapes cannot be decoded, instead of failing", () => {
    expect(safeNextPath("/%E0%A4%A")).toBeNull();
  });

  it("keeps an encoded slash in the query, where it cannot change the page", () => {
    expect(safeNextPath("/pad?from=%2Fsettings")).toBe("/pad?from=%2Fsettings");
  });

  it("refuses an encoded slash or backslash in the path", () => {
    expect(safeNextPath("/%2F%2Fevil.example")).toBeNull();
    expect(safeNextPath("/%5cevil.example")).toBeNull();
  });

  it("refuses the API and Next's own files, however the path is spelled", () => {
    for (const path of [
      "/api",
      "/api/me",
      "/API/me",
      "/api/auth/verify-email?token=x",
      "/pad/../api/me",
      "/pad/%2e%2e/api/me",
      "/./api/me",
      "/%61pi/me",
      "/_next/static/a.js",
      "/_next/image?url=//evil.example",
    ]) {
      expect(safeNextPath(path), path).toBeNull();
    }
    expect(safeNextPath("/apiary")).toBe("/apiary");
  });

  it("refuses the sign-in pages, so a link cannot loop or land on a reset page it chose", () => {
    for (const path of [
      "/sign-in",
      "/sign-in?next=/pad",
      "/sign-up",
      "/check-email",
      "/forgot-password",
      "/reset-password?token=x",
      "/Reset-Password?token=x",
      // Next sends a trailing slash on to the page without it, query and all.
      "/reset-password/?token=x",
      "/check-email/",
      "/sign-in//?next=/pad",
    ]) {
      expect(safeNextPath(path), path).toBeNull();
    }
  });

  it("sends a person to the pad when there is nowhere else to go", () => {
    expect(AFTER_SIGN_IN).toBe("/pad");
  });
});
