import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkTestEnvironment, envFile, loadDotEnv, parseEnv } from "../src/config/env.js";

// The smallest set that is valid. The secret is made up and is only ever used by these tests.
const base = {
  DATABASE_URL: "postgresql://someone@localhost:5443/launchpad_test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3100",
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
