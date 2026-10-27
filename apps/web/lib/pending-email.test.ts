import { describe, expect, it, vi } from "vitest";
import { forgetPendingEmail, readPendingEmail, rememberPendingEmail } from "./pending-email";

describe("the pending address", () => {
  it("is kept in this tab until it is forgotten", () => {
    rememberPendingEmail("ana@example.com");
    expect(readPendingEmail()).toBe("ana@example.com");
    forgetPendingEmail();
    expect(readPendingEmail()).toBeNull();
  });

  it("is kept at the longest an address can be", () => {
    const longest = `${"a".repeat(242)}@example.com`;
    expect(longest).toHaveLength(254);
    rememberPendingEmail(longest);
    expect(readPendingEmail()).toBe(longest);
  });

  it("is ignored when it is longer than any address could be", () => {
    sessionStorage.setItem("launchpad.pending-email", `${"a".repeat(250)}@example.com`);
    expect(readPendingEmail()).toBeNull();
  });

  it("is ignored when it is not an address the form would accept", () => {
    sessionStorage.setItem("launchpad.pending-email", "not an address");
    expect(readPendingEmail()).toBeNull();
  });

  it("is simply missing when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberPendingEmail("ana@example.com")).not.toThrow();
    expect(() => forgetPendingEmail()).not.toThrow();
    expect(readPendingEmail()).toBeNull();
  });
});
