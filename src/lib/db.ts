import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Ensure Supabase pooler uses transaction mode (6543) + pgbouncer params to avoid "prepared statement already exists". */
function getDatasourceUrl(): string | undefined {
  const u = process.env.DATABASE_URL;
  if (!u) return undefined;
  if (!u.includes("pooler.supabase.com")) return u;
  // Force port 6543 (transaction mode); 5432 = session mode, causes prepared-statement collisions
  let base = u.split("?")[0];
  if (base.includes(":5432/")) base = base.replace(":5432/", ":6543/");
  const existingParams = u.includes("?") ? u.split("?")[1] : "";
  const params = new URLSearchParams(existingParams);
  params.set("pgbouncer", "true");
  params.set("connection_limit", "1");
  if (!params.has("sslmode")) params.set("sslmode", "require");
  return `${base}?${params.toString()}`;
}

const datasourceUrl = getDatasourceUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(datasourceUrl && { datasources: { db: { url: datasourceUrl } } }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
