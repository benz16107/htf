import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url =
    process.env.RUNTIME_DATABASE_URL || process.env.DATABASE_URL;

  if (url?.startsWith("prisma://")) {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  if (url?.includes("pooler.supabase.com") || url?.includes(":6543/")) {
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url && { datasources: { db: { url } } }),
  });
}

const runtimeUrl =
  process.env.RUNTIME_DATABASE_URL || process.env.DATABASE_URL;
const useAccelerate = runtimeUrl?.startsWith("prisma://");
const shouldCache = process.env.NODE_ENV !== "production" || !useAccelerate;

export const db: PrismaClient =
  shouldCache && globalForPrisma.prisma
    ? globalForPrisma.prisma
    : createPrismaClient();

if (shouldCache) {
  globalForPrisma.prisma = db;
}
