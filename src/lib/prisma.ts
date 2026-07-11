import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

function createPrisma() {
  const dbUrl =
    process.env.DATABASE_URL ??
    `file:${path.join(process.cwd(), "prisma/dev.db")}`;

  // Turso URLs start with libsql:// or https:// — don't prepend file:
  const url = dbUrl.includes("://") ? dbUrl : (dbUrl.startsWith("file:") ? dbUrl : `file:${dbUrl}`);

  const adapter = new PrismaLibSql({
    url,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
