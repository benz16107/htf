import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  const useAccelerate = url?.startsWith("prisma://");

  if (useAccelerate && url) {
    const Client = PrismaClient as unknown as new (opts: { log?: string[]; accelerateUrl: string }) => InstanceType<typeof PrismaClient>;
    return new Client({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"], accelerateUrl: url }).$extends(withAccelerate()) as unknown as PrismaClient;
  }

  // Supabase pooler: force transaction mode (6543) + pgbouncer params
  let datasourceUrl = url;
  if (url?.includes("pooler.supabase.com")) {
    let base = url.split("?")[0];
    if (base.includes(":5432/")) base = base.replace(":5432/", ":6543/");
    const params = new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
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

// When using Accelerate (prisma://), never cache in production - avoids stale client from prior deployments
const useAccelerate = process.env.DATABASE_URL?.startsWith("prisma://");
const shouldCache = process.env.NODE_ENV !== "production" || !useAccelerate;

export const db: PrismaClient =
  shouldCache && globalForPrisma.prisma ? globalForPrisma.prisma : createPrismaClient();

if (shouldCache) {
  globalForPrisma.prisma = db;
}
