import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// A failed query's own message can carry the values it was given, so Prisma logs nothing but
// warnings in development. The error handler logs a failure as its class and its code.
export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn"] : [],
});
