import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  const url =
    process.env.RUNTIME_DATABASE_URL ||
    process.env.DATABASE_URL;
  const useAccelerate = url?.startsWith("prisma://");

  if (useAccelerate && url) {
    return new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  let datasourceUrl = url;
  if (url?.includes("pooler.supabase.com") || url?.includes("pgbouncer=true")) {
    const [base, qs] = url!.split("?");
    const params = new URLSearchParams(qs ?? "");
    params.set("pgbouncer", "true");
    params.set("connection_limit", "1");
    if (!params.has("sslmode")) params.set("sslmode", "require");
    datasourceUrl = `${base}?${params.toString()}`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(datasourceUrl && { datasources: { db: { url: datasourceUrl } } }),
  });
}

const runtimeUrl =
  process.env.RUNTIME_DATABASE_URL ||
  process.env.DATABASE_URL;
const useAccelerate = runtimeUrl?.startsWith("prisma://");
const shouldCache = process.env.NODE_ENV !== "production" || !useAccelerate;

export const db: PrismaClient =
  shouldCache && globalForPrisma.prisma ? globalForPrisma.prisma : createPrismaClient();

if (shouldCache) {
  globalForPrisma.prisma = db;
}
