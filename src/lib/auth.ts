import { cookies } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type AppRole = "OWNER";
export type AuthMode = "credentials";
export type CompanyAccountAccess = "OWNER";

export type AppSession = {
  userId: string;
  email: string;
  companyId: string | null;
  accountAccess: CompanyAccountAccess | null;
  role?: AppRole | null;
  authMode: AuthMode;
  providerUserId: string | null;
};

const SESSION_COOKIE_NAME = "htf_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export const authCookieNames = {
  session: SESSION_COOKIE_NAME,
} as const;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters (e.g. openssl rand -hex 32)");
  }
  return secret;
}

function signPayload(payload: string): string {
  const secret = getSessionSecret();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return payload + "." + hmac.digest("hex");
}

function verifyAndDecode(signed: string): { userId: string; companyId: string | null } | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const secret = getSessionSecret();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.userId || typeof data.userId !== "string") return null;
    if (data.exp && typeof data.exp === "number" && data.exp < Date.now() / 1000) return null;
    return {
      userId: data.userId,
      companyId: typeof data.companyId === "string" ? data.companyId : null,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const decoded = verifyAndDecode(raw);
  if (!decoded) return null;

  const user = await db.user.findUnique({
    where: { id: decoded.userId },
  });
  if (!user) return null;

  let companyId = decoded.companyId;
  const link = await db.userCompanyRole.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { companyId: true, role: true },
  });
  if (link) {
    companyId = companyId || link.companyId;
  } else {
    companyId = null;
  }

  return {
    userId: user.id,
    email: user.email,
    companyId,
    accountAccess: "OWNER",
    role: link?.role ?? "OWNER",
    authMode: "credentials",
    providerUserId: user.externalAuthId,
  };
}

export async function createSession(userId: string, companyId: string | null): Promise<string> {
  const payload = JSON.stringify({
    userId,
    companyId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return signPayload(encoded);
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE_SEC,
  path: "/",
};

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function validatePassword(email: string, password: string): Promise<{ id: string; companyId: string | null } | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const link = await db.userCompanyRole.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { companyId: true },
  });
  return { id: user.id, companyId: link?.companyId ?? null };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function hasCompletedSetup(): Promise<boolean> {
  const session = await getSession();
  if (!session?.companyId) return false;

  const company = await db.company.findUnique({
    where: { id: session.companyId },
    select: { setupCompleted: true },
  });

  return company?.setupCompleted ?? false;
}
