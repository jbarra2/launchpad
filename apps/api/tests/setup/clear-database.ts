import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { isTestDatabaseName } from "./test-env.js";

// Empties every table. The tables come from the database, so a model added later is cleared too
// and can never leak rows from one test into the next. The database is asked for its own name
// first, as a second check behind the one in test-env.ts. The end-to-end tests use this too.
export async function clearTestDatabase(
  db: Pick<PrismaClient, "$queryRaw" | "$executeRaw">,
): Promise<void> {
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  if (!name || !isTestDatabaseName(name)) {
    throw new Error("The tests will not empty a database that is not a Launchpad test database.");
  }
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const names = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
    await db.$executeRaw`TRUNCATE TABLE ${Prisma.raw(names)} RESTART IDENTITY CASCADE`;
  }
}
