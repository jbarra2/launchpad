import { afterAll, beforeEach } from "vitest";
import { outbox, resetMailThrottle } from "../../src/lib/mailer.js";
import { prisma } from "../../src/lib/prisma.js";
import { clearTestDatabase } from "./clear-database.js";

// Every test starts with empty tables and an empty outbox.
beforeEach(async () => {
  await clearTestDatabase(prisma);
  outbox.length = 0;
  resetMailThrottle();
});

afterAll(async () => {
  await prisma.$disconnect();
});
