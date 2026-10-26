// Shared by vitest.config.ts, the global setup, and the reset. The tests empty every table of the
// database they run against, so they refuse any database that is not plainly this project's test
// database on this machine. The refusal never repeats the address, because it can hold a password.

const TEST_DATABASE_NAME = /^launchpad(_[a-z0-9]+)*_test$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The database name inside a connection string, or an empty string. */
export function databaseNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    return "";
  }
}

export function isTestDatabaseName(name: string): boolean {
  return TEST_DATABASE_NAME.test(name);
}

export function checkTestDatabase(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // The same refusal as any other address that is not a local test database.
  }
  if (!LOCAL_HOSTS.has(host) || !isTestDatabaseName(databaseNameOf(url))) {
    throw new Error(
      "The tests empty every table of their database, so they only run against a database on this " +
        "machine whose name ends in _test and starts with launchpad. Check TEST_DATABASE_URL, or " +
        "unset it to use the one that `npm run db:test:up` starts.",
    );
  }
  return url;
}

// In CI the workflow sets TEST_DATABASE_URL for the service it starts. The local default is the
// db-test container from docker-compose.yml, whose password only exists on this machine. An empty
// value counts as unset.
export const testDatabaseUrl = checkTestDatabase(
  process.env.TEST_DATABASE_URL ||
    "postgresql://launchpad:launchpad@localhost:5443/launchpad_test?schema=public",
);
