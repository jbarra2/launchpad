import { describe, expect, it } from "vitest";
import { checkTestDatabase, databaseNameOf, isTestDatabaseName } from "./setup/test-env.js";

const local = (name: string, host = "localhost") =>
  `postgresql://someone@${host}:5443/${name}?schema=public`;

describe("checkTestDatabase", () => {
  it.each(["launchpad_test", "launchpad_ci_test"])("accepts a local database named %s", (name) => {
    expect(checkTestDatabase(local(name))).toBe(local(name));
    expect(checkTestDatabase(local(name, "127.0.0.1"))).toBe(local(name, "127.0.0.1"));
  });

  it.each([
    ["a database that is not a test database", local("launchpad")],
    ["another project's test database", local("other_project_test")],
    ["a name that only ends in _test", local("production_test")],
    ["a remote host", local("launchpad_test", "db.example.com")],
    ["an address with no database name", "postgresql://someone@localhost:5443"],
    ["something that is not an address", "not a url"],
    ["an empty address", ""],
  ])("refuses %s, and never repeats the address", (_label, url) => {
    let message = "";
    try {
      checkTestDatabase(url);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/only run against a database on this machine/);
    if (url) {
      expect(message).not.toContain(url);
    }
  });
});

describe("databaseNameOf", () => {
  it("reads the name from the path and ignores the query", () => {
    expect(databaseNameOf(local("launchpad_test"))).toBe("launchpad_test");
    expect(databaseNameOf("nonsense")).toBe("");
  });

  it("matches the names the tests may empty and no others", () => {
    expect(isTestDatabaseName("launchpad_test")).toBe(true);
    expect(isTestDatabaseName("launchpad")).toBe(false);
    expect(isTestDatabaseName("launchpad_test_backup")).toBe(false);
    expect(isTestDatabaseName("")).toBe(false);
  });
});
