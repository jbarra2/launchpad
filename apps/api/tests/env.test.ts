import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkTestEnvironment, envFile, loadDotEnv, parseEnv } from "../src/config/env.js";

// 32 made-up bytes in base64, used only by these tests.
const CREDENTIAL_KEY = Buffer.alloc(32, 9).toString("base64");

// The smallest set that is valid. The secrets are made up and are only ever used by these tests.
const base = {
  DATABASE_URL: "postgresql://someone@localhost:5443/launchpad_test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3100",
  CREDENTIAL_KEY,
};

function messageFor(source: Record<string, string>): string {
  try {
    parseEnv({ ...base, ...source });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("parseEnv did not throw");
}

describe("parseEnv", () => {
  it("uses the defaults when only the required settings are given", () => {
    expect(parseEnv(base)).toEqual({
      ...base,
      NODE_ENV: "development",
      PORT: 4100,
      TRUST_PROXY_HOPS: 0,
      MAIL_TRANSPORT: "console",
      CREDENTIAL_KEY_VERSION: 1,
      ANTHROPIC_TIMEOUT_MS: 90_000,
    });
  });

  it("reads the values it is given", () => {
    const parsed = parseEnv({
      ...base,
      NODE_ENV: "test",
      PORT: "5000",
      TRUST_PROXY_HOPS: "2",
    });
    expect(parsed).toMatchObject({ NODE_ENV: "test", PORT: 5000, TRUST_PROXY_HOPS: 2 });
  });

  it("treats an empty value as unset", () => {
    expect(parseEnv({ ...base, NODE_ENV: "", PORT: "", TRUST_PROXY_HOPS: "" })).toMatchObject({
      NODE_ENV: "development",
      PORT: 4100,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("ignores variables it does not know, so they never reach an error", () => {
    expect(parseEnv({ ...base, SOMETHING_ELSE: "kept-out" })).not.toHaveProperty("SOMETHING_ELSE");
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

describe("the settings for the database and sign-in", () => {
  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"])("%s is required", (name) => {
    const without = Object.fromEntries(Object.entries(base).filter(([key]) => key !== name));
    expect(() => parseEnv(without)).toThrow(new RegExp(`${name}: is required|${name}:`));
    expect(() => parseEnv({ ...without, [name]: "" })).toThrow(name);
  });

  it("refuses a database address that is not Postgres, without repeating it", () => {
    const message = messageFor({ DATABASE_URL: "mysql://root:hunter2@host/db" });
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("hunter2");
  });

  it("refuses a secret under 32 characters, without repeating it", () => {
    const tooShort = "y".repeat(31);
    const message = messageFor({ BETTER_AUTH_SECRET: tooShort });
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain(tooShort);
  });

  it.each(["not a url", "ftp://localhost:3100", "http://localhost:3100/some/path"])(
    "refuses BETTER_AUTH_URL=%s",
    (value) => {
      expect(messageFor({ BETTER_AUTH_URL: value })).toContain("BETTER_AUTH_URL");
    },
  );

  it("refuses an unknown MAIL_TRANSPORT", () => {
    expect(messageFor({ MAIL_TRANSPORT: "carrier-pigeon" })).toContain("MAIL_TRANSPORT");
  });

  it.each([
    ["not base64", "this is not base64 at all, not even close!!"],
    ["31 bytes", Buffer.alloc(31, 1).toString("base64")],
    ["33 bytes", Buffer.alloc(33, 1).toString("base64")],
    ["base64url", Buffer.alloc(32, 0xfb).toString("base64url")],
    ["no padding", Buffer.alloc(32, 2).toString("base64").replace(/=$/, "")],
  ])("refuses a CREDENTIAL_KEY that is %s, without repeating it", (_name, value) => {
    const message = messageFor({ CREDENTIAL_KEY: value });
    expect(message).toContain("CREDENTIAL_KEY: must be 32 bytes written in base64");
    expect(message).not.toContain(value);
  });

  it("needs a CREDENTIAL_KEY", () => {
    expect(messageFor({ CREDENTIAL_KEY: "" })).toContain("CREDENTIAL_KEY: is required");
  });

  it("refuses a CREDENTIAL_KEY that is also the session secret, without repeating it", () => {
    const message = messageFor({ BETTER_AUTH_SECRET: CREDENTIAL_KEY });
    expect(message).toContain("CREDENTIAL_KEY: must not be the same as BETTER_AUTH_SECRET");
    expect(message).not.toContain(CREDENTIAL_KEY);
  });

  it("reads the key version and the Claude timeout, within their ranges", () => {
    expect(
      parseEnv({ ...base, CREDENTIAL_KEY_VERSION: "2", ANTHROPIC_TIMEOUT_MS: "1000" }),
    ).toMatchObject({ CREDENTIAL_KEY_VERSION: 2, ANTHROPIC_TIMEOUT_MS: 1000 });
    expect(messageFor({ CREDENTIAL_KEY_VERSION: "0" })).toContain("CREDENTIAL_KEY_VERSION");
    expect(messageFor({ ANTHROPIC_TIMEOUT_MS: "999" })).toContain("ANTHROPIC_TIMEOUT_MS");
    expect(messageFor({ ANTHROPIC_TIMEOUT_MS: "600001" })).toContain("ANTHROPIC_TIMEOUT_MS");
  });

  it("refuses extra headers for every Claude call, without repeating them", () => {
    const message = messageFor({ ANTHROPIC_CUSTOM_HEADERS: "Authorization: Bearer someone-else" });
    expect(message).toContain("ANTHROPIC_CUSTOM_HEADERS: must not be set");
    expect(message).not.toContain("someone-else");
  });

  it("takes a stand-in address for Anthropic outside production, for the end-to-end tests", () => {
    expect(parseEnv({ ...base, ANTHROPIC_BASE_URL: "http://127.0.0.1:4299" })).toMatchObject({
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4299",
    });
    expect(messageFor({ ANTHROPIC_BASE_URL: "file:///etc/passwd" })).toContain(
      "ANTHROPIC_BASE_URL",
    );
  });
});

describe("production", () => {
  const production = {
    ...base,
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://launchpad.example",
  };

  it("refuses the console mail transport, because the links would be printed in the log", () => {
    expect(() => parseEnv(production)).toThrow(/MAIL_TRANSPORT: cannot be console/);
  });

  it("refuses a web address that is not https", () => {
    expect(() => parseEnv({ ...production, BETTER_AUTH_URL: "http://launchpad.example" })).toThrow(
      /BETTER_AUTH_URL: must use https/,
    );
  });

  it("wants the proxy count set on purpose, because a wrong default puts everyone in one rate limit", () => {
    // MAIL_TRANSPORT is not the problem here, so it is given a value the check cannot refuse.
    const message = (source: Record<string, string>) => {
      try {
        parseEnv({ ...production, ...source });
      } catch (error) {
        return (error as Error).message;
      }
      return "";
    };
    expect(message({})).toMatch(/TRUST_PROXY_HOPS: must be set in production/);
    expect(message({ TRUST_PROXY_HOPS: "" })).toMatch(
      /TRUST_PROXY_HOPS: must be set in production/,
    );
    expect(message({ TRUST_PROXY_HOPS: "1" })).not.toMatch(/TRUST_PROXY_HOPS/);
    expect(message({ TRUST_PROXY_HOPS: "0" })).not.toMatch(/TRUST_PROXY_HOPS/);
  });

  it("does not ask for it outside production", () => {
    expect(parseEnv(base).TRUST_PROXY_HOPS).toBe(0);
  });

  it("refuses a stand-in address for Anthropic, because every saved key would be sent there", () => {
    expect(() =>
      parseEnv({ ...production, TRUST_PROXY_HOPS: "1", ANTHROPIC_BASE_URL: "https://x.example" }),
    ).toThrow(/ANTHROPIC_BASE_URL: cannot be set in production/);
  });
});

describe("checkTestEnvironment", () => {
  it("lets the test setting through only under the test runner", () => {
    expect(() => checkTestEnvironment("test", true)).not.toThrow();
    expect(() => checkTestEnvironment("test", false)).toThrow(/only for the test runner/);
  });

  it("has nothing to say about the other settings", () => {
    expect(() => checkTestEnvironment("development", false)).not.toThrow();
    expect(() => checkTestEnvironment("production", false)).not.toThrow();
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
