import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { envFile, loadDotEnv, parseEnv } from "../src/config/env.js";

function messageFor(source: Record<string, string>): string {
  try {
    parseEnv(source);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("parseEnv did not throw");
}

describe("parseEnv", () => {
  it("uses the defaults when nothing is set", () => {
    expect(parseEnv({})).toEqual({ NODE_ENV: "development", PORT: 4100, TRUST_PROXY_HOPS: 1 });
  });

  it("reads the values it is given", () => {
    expect(parseEnv({ NODE_ENV: "production", PORT: "5000", TRUST_PROXY_HOPS: "2" })).toEqual({
      NODE_ENV: "production",
      PORT: 5000,
      TRUST_PROXY_HOPS: 2,
    });
  });

  it("treats an empty value as unset", () => {
    expect(parseEnv({ NODE_ENV: "", PORT: "", TRUST_PROXY_HOPS: "" })).toEqual({
      NODE_ENV: "development",
      PORT: 4100,
      TRUST_PROXY_HOPS: 1,
    });
  });

  it("ignores variables it does not know, so they never reach an error", () => {
    expect(parseEnv({ DATABASE_URL: "postgresql://user:pass@host/db" }).PORT).toBe(4100);
  });

  it.each(["secret-port-value", "70001", "41.5", "-3"])(
    "refuses PORT=%s, names the setting, and does not repeat the value",
    (value) => {
      const message = messageFor({ PORT: value });
      expect(message).toContain("PORT");
      expect(message).not.toContain(value);
    },
  );

  it("refuses an unknown NODE_ENV and does not repeat it", () => {
    const message = messageFor({ NODE_ENV: "staging-x7" });
    expect(message).toContain("NODE_ENV");
    expect(message).not.toContain("staging-x7");
  });

  it("refuses a negative TRUST_PROXY_HOPS", () => {
    expect(messageFor({ TRUST_PROXY_HOPS: "-1" })).toContain("TRUST_PROXY_HOPS");
  });

  it("lists every setting that is wrong", () => {
    const message = messageFor({ PORT: "nope", NODE_ENV: "nope" });
    expect(message).toContain("PORT");
    expect(message).toContain("NODE_ENV");
  });
});

describe("envFile", () => {
  it("is the .env at the root of the repository", () => {
    const root = path.dirname(envFile);
    const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(path.basename(envFile)).toBe(".env");
    expect(rootPackage.name).toBe("launchpad");
  });
});

describe("loadDotEnv", () => {
  const names = ["LAUNCHPAD_TEST_FROM_FILE", "LAUNCHPAD_TEST_ALREADY_SET"];
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "launchpad-api-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const name of names) {
      delete process.env[name];
    }
  });

  it("is fine with a file that is not there", () => {
    expect(() => loadDotEnv(path.join(dir, ".env"))).not.toThrow();
  });

  it("loads the file, and a variable that is already set wins over it", () => {
    process.env.LAUNCHPAD_TEST_ALREADY_SET = "from-the-environment";
    const file = path.join(dir, ".env");
    fs.writeFileSync(
      file,
      "LAUNCHPAD_TEST_FROM_FILE=from-the-file\nLAUNCHPAD_TEST_ALREADY_SET=from-the-file\n",
    );
    loadDotEnv(file);
    expect(process.env.LAUNCHPAD_TEST_FROM_FILE).toBe("from-the-file");
    expect(process.env.LAUNCHPAD_TEST_ALREADY_SET).toBe("from-the-environment");
  });

  it("does not hide any other problem with the file", () => {
    // A folder where the file should be is not a missing file.
    expect(() => loadDotEnv(dir)).toThrow();
  });
});
