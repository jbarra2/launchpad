import { describe, expect, it, vi } from "vitest";
import { clearTestDatabase } from "./setup/clear-database.js";

// The suite always runs against a test database, so the refusal is tested with a stand-in.
function stubDatabase(rows: { name: string }[]) {
  return {
    $queryRaw: vi.fn(async () => rows),
    $executeRaw: vi.fn(async () => 0),
  } as unknown as Parameters<typeof clearTestDatabase>[0] & {
    $executeRaw: ReturnType<typeof vi.fn>;
  };
}

describe("clearTestDatabase", () => {
  it("refuses to empty a database that is not a Launchpad test database", async () => {
    for (const rows of [[{ name: "launchpad" }], [{ name: "other_test" }], []]) {
      const db = stubDatabase(rows);
      await expect(clearTestDatabase(db)).rejects.toThrow(
        "The tests will not empty a database that is not a Launchpad test database.",
      );
      expect(db.$executeRaw).not.toHaveBeenCalled();
    }
  });
});
