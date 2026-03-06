import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { clearSession, authCookieNames } from "@/lib/auth";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  await clearSession();
  const res = NextResponse.redirect(new URL("/sign-in", origin));
  res.cookies.delete(authCookieNames.session);
  return res;
}
