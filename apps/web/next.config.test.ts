// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apiRewrites,
  buildConfig,
  loadApiSettings,
  readApiSettings,
  readEnvFile,
  securityHeaders,
} from "./next.config";

describe("readApiSettings", () => {
  it("falls back to the local API and the default Claude timeout plus a margin", () => {
    expect(readApiSettings({})).toEqual({
      origin: "http://localhost:4100",
      proxyTimeoutMs: 120_000,
    });
  });

  it("waits 30 seconds longer than the API waits for Claude", () => {
    expect(readApiSettings({ ANTHROPIC_TIMEOUT_MS: "60000" }).proxyTimeoutMs).toBe(90_000);
  });

  it("treats empty values as unset", () => {
    expect(readApiSettings({ API_INTERNAL_URL: "", ANTHROPIC_TIMEOUT_MS: "" })).toEqual(
      readApiSettings({}),
    );
  });

  it("keeps only the origin, so a path, a query, and a password are dropped", () => {
    const url = new URL("http://api.internal:4100/base/path?x=1");
    url.username = "someone";
    url.password = "pw";
    expect(readApiSettings({ API_INTERNAL_URL: url.href }).origin).toBe("http://api.internal:4100");
  });

  it.each(["ftp://api.internal", "not a url", "//api.internal"])(
    "refuses API_INTERNAL_URL=%s and does not repeat it",
    (value) => {
      expect(() => readApiSettings({ API_INTERNAL_URL: value })).toThrow(/API_INTERNAL_URL/);
      expect(() => readApiSettings({ API_INTERNAL_URL: value })).not.toThrow(value);
    },
  );

  it.each(["soon", "10", "9999999", "90.5"])("refuses ANTHROPIC_TIMEOUT_MS=%s", (value) => {
    expect(() => readApiSettings({ ANTHROPIC_TIMEOUT_MS: value })).toThrow(/ANTHROPIC_TIMEOUT_MS/);
  });
});

describe("the root .env file", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "launchpad-web-"));
    file = path.join(dir, ".env");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is optional", () => {
    expect(readEnvFile(file)).toEqual({});
    expect(loadApiSettings({}, file)).toEqual(readApiSettings({}));
  });

  it("gives up only the two settings Next needs, never a secret", () => {
    fs.writeFileSync(
      file,
      "API_INTERNAL_URL=http://api.internal:4200\nANTHROPIC_TIMEOUT_MS=45000\nCREDENTIAL_KEY=not-a-real-key\n",
    );
    const read = readEnvFile(file);
    expect(Object.keys(read).sort()).toEqual(["ANTHROPIC_TIMEOUT_MS", "API_INTERNAL_URL"]);
    expect(JSON.stringify(read)).not.toContain("not-a-real-key");
    expect(loadApiSettings({}, file)).toEqual({
      origin: "http://api.internal:4200",
      proxyTimeoutMs: 75_000,
    });
  });

  it("loses to a variable that is really set", () => {
    fs.writeFileSync(file, "API_INTERNAL_URL=http://from-file:4100\n");
    expect(loadApiSettings({ API_INTERNAL_URL: "http://from-env:4100" }, file).origin).toBe(
      "http://from-env:4100",
    );
  });
});

describe("the config", () => {
  const settings = { origin: "http://api.internal:4100", proxyTimeoutMs: 120_000 };

  it("sends the health check and then every other /api path to the API, in that order", () => {
    expect(apiRewrites(settings.origin)).toEqual([
      { source: "/api/health", destination: "http://api.internal:4100/health" },
      { source: "/api/:path*", destination: "http://api.internal:4100/api/:path*" },
    ]);
  });

  it("raises the proxy timeout, hides the framework, and rewrites to the API", async () => {
    const config = buildConfig(settings);
    expect(config.experimental?.proxyTimeout).toBe(120_000);
    expect(config.poweredByHeader).toBe(false);
    expect(await config.rewrites?.()).toEqual(apiRewrites(settings.origin));
  });

  it("gives server code the same API address as the rewrites, and nothing else", () => {
    // The root .env is never read into process.env, so this is the only way the proxy and the
    // server components learn the address.
    expect(buildConfig(settings).env).toEqual({ API_INTERNAL_URL: settings.origin });
  });

  it("sends the security headers on every path", async () => {
    const headers = await buildConfig(settings).headers?.();
    expect(headers).toHaveLength(1);
    expect(headers?.[0]?.source).toBe("/:path*");
    const keys = headers?.[0]?.headers.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "Referrer-Policy",
        "X-Frame-Options",
        "Cross-Origin-Opener-Policy",
        "Permissions-Policy",
      ]),
    );
  });

  it("adds Strict-Transport-Security for a production build only", () => {
    const hsts = (production: boolean) =>
      securityHeaders(production).some((header) => header.key === "Strict-Transport-Security");
    expect(hsts(true)).toBe(true);
    expect(hsts(false)).toBe(false);
  });
});
