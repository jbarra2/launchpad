import { afterAll, beforeEach } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { outbox, resetMailThrottle } from "../../src/lib/mailer.js";
import { prisma } from "../../src/lib/prisma.js";
import { isTestDatabaseName } from "./test-env.js";

// Every test starts with empty tables and an empty outbox. The tables come from the database, so a
// model added later is cleared too and can never leak rows from one test into the next. The
// database is asked for its own name first, as a second check behind the one in test-env.ts.
beforeEach(async () => {
  const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  if (!name || !isTestDatabaseName(name)) {
    throw new Error("The tests will not empty a database that is not a Launchpad test database.");
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const names = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
    await prisma.$executeRaw`TRUNCATE TABLE ${Prisma.raw(names)} RESTART IDENTITY CASCADE`;
  }
  outbox.length = 0;
  resetMailThrottle();
});

afterAll(async () => {
  await prisma.$disconnect();
});
