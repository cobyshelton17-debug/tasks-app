import "@prisma/client/runtime/library";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { config } from "./config.js";

const needsSsl = new URL(config.databaseUrl).searchParams.get("sslmode") === "require";

const pool = new Pool({
  connectionString: config.databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});
