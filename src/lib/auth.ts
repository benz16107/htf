import { db } from "@/lib/db";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const AUTH_PROVIDER = process.env.AUTH_PROVIDER;
export type AppRole = "OWNER";
export type AuthMode = "supabase";

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

export const authCookieNames = {
  session: "htf_session",
} as const;

function parseSession(raw?: string): AppSession | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

function normalizeCompanyOwnerAccess(): CompanyAccountAccess {
  return "OWNER";
}

/** Resolve app session from Supabase auth and DB User/UserCompanyRole. */
export async function getSession(): Promise<AppSession | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  let appUser = await db.user.findUnique({
    where: { externalAuthId: user.id },
  });
  if (!appUser) {
    appUser = await db.user.findUnique({
      where: { email: user.email },
    });
    if (appUser) {
      await db.user.update({
        where: { id: appUser.id },
        data: { externalAuthId: user.id },
      });
    } else {
      appUser = await db.user.create({
        data: { externalAuthId: user.id, email: user.email },
      });
    }
  }

  const roleRow = await db.userCompanyRole.findFirst({
    where: { userId: appUser.id },
    select: { companyId: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    userId: appUser.id,
    email: appUser.email,
    companyId: roleRow?.companyId ?? null,
    accountAccess: normalizeCompanyOwnerAccess(),
    role: "OWNER",
    authMode: "supabase",
    providerUserId: user.id,
  };
}

export async function hasCompletedSetup(): Promise<boolean> {
  const session = await getSession();
  if (session?.companyId) {
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { setupCompleted: true },
    });
    return company?.setupCompleted ?? false;
  }
  return false;
}
