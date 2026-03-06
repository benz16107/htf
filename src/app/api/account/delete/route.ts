import { NextResponse } from "next/server";
import { getSession, clearSession, authCookieNames, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/account/delete
 * Deletes the current user's account and all associated data (company and all cascaded data).
 * Requires session. Clears session cookie; client should redirect to /sign-in.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company linked to this account" },
      { status: 400 }
    );
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.company.delete({ where: { id: companyId } });
      await tx.user.delete({ where: { id: session!.userId } });
    });
  } catch (e) {
    console.error("Account delete error:", e);
    return NextResponse.json(
      { error: "Failed to delete account and data" },
      { status: 500 }
    );
  }

  await clearSession();
  const res = NextResponse.json({ success: true });
  res.cookies.set(authCookieNames.session, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return res;
}
