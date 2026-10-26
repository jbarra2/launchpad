import { afterEach, describe, expect, it, vi } from "vitest";
import { authLog } from "../src/lib/auth-log.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authLog", () => {
  it("prints an error as its message alone, never the error object that comes with it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("connection refused for postgresql://user:hunter2@host/db");
    authLog("error", "TypeError", failure, { email: "ana@example.com", hash: "$argon2id$abc" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toEqual(["[auth] TypeError"]);
  });

  it("prints a warning the same way, on the warning channel", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    authLog("warn", "Password is too long", { password: "secret-value-here" });
    expect(warn.mock.calls).toEqual([["[auth] Password is too long"]]);
  });

  it("prints nothing below a warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    authLog("info", "Sign-up attempt for existing email: ana@example.com");
    authLog("debug", "details");
    authLog("success", "done");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
