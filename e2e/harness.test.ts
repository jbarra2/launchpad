import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAIL_LINE, assertPortFree, builtApiOrigin, childEnv, redact } from "./harness.js";

describe("childEnv", () => {
  it("passes on only what the operating system needs, plus the settings given", () => {
    const env = childEnv(
      { NODE_ENV: "development" },
      {
        PATH: "/bin",
        NODE_ENV: "test",
        VITEST: "true",
        DATABASE_URL: "postgresql://real",
        BETTER_AUTH_SECRET: "x",
      },
    );
    expect(env).toEqual({ PATH: "/bin", NODE_ENV: "development" });
  });
});

describe("assertPortFree", () => {
  let server: net.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  it("refuses a port something is listening on", async () => {
    server = net.createServer();
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as net.AddressInfo;
    await expect(assertPortFree(port)).rejects.toThrow(`Port ${port} is in use.`);
  });

  it("accepts a port nothing is listening on", async () => {
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
    const { port } = probe.address() as net.AddressInfo;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await expect(assertPortFree(port)).resolves.toBeUndefined();
  });
});

describe("redact", () => {
  it("takes the tokens out of printed links", () => {
    const text =
      "[mail] email-verification link for ana@example.com: http://x/api/auth/verify-email?token=abc.def&callbackURL=%2F\n" +
      "[mail] password-reset link for ana@example.com: http://x/api/auth/reset-password/Zq9?callbackURL=%2Freset-password";
    const out = redact(text);
    expect(out).not.toContain("abc.def");
    expect(out).not.toContain("Zq9");
    expect(out).toContain("token=[redacted]");
    expect(out).toContain("/reset-password/[redacted]");
  });
});

describe("MAIL_LINE", () => {
  it("reads the kind, the address, and the link from the API's mail line", () => {
    const match = MAIL_LINE.exec(
      "[mail] email-verification link for ana@example.com: http://127.0.0.1:3199/api/auth/verify-email?token=t",
    );
    expect(match?.slice(1)).toEqual([
      "email-verification",
      "ana@example.com",
      "http://127.0.0.1:3199/api/auth/verify-email?token=t",
    ]);
  });

  it("reads the notice an address with an account gets when someone signs up with it", () => {
    const match = MAIL_LINE.exec(
      "[mail] account-exists link for ana@example.com: http://127.0.0.1:3199/sign-in",
    );
    expect(match?.slice(1)).toEqual([
      "account-exists",
      "ana@example.com",
      "http://127.0.0.1:3199/sign-in",
    ]);
  });
});

describe("builtApiOrigin", () => {
  function buildWith(config: unknown): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launchpad-build-"));
    fs.writeFileSync(path.join(dir, "required-server-files.json"), JSON.stringify({ config }));
    return dir;
  }

  it("reads the API address the web build was made with", () => {
    const dir = buildWith({ env: { API_INTERNAL_URL: "http://localhost:4199" } });
    expect(builtApiOrigin(dir)).toBe("http://localhost:4199");
  });

  it("refuses a build that has no API address", () => {
    expect(() => builtApiOrigin(buildWith({ env: {} }))).toThrow(
      "The web build has no API address.",
    );
  });
});
