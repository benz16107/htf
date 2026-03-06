import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSession, validatePassword, SESSION_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const origin = getRequestOrigin(request);

  const email = (formData.get("email")?.toString() ?? "").trim();
  const password = formData.get("password")?.toString() ?? "";
  const redirectTo = (formData.get("redirectTo")?.toString() ?? "").trim() || "/dashboard";

  if (!email || !password) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_fields", origin));
  }

  const user = await validatePassword(email, password);
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_credentials", origin));
  }

  const token = await createSession(user.id, user.companyId);
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/dashboard", origin);
  const res = NextResponse.redirect(url);
  res.cookies.set("htf_session", token, SESSION_COOKIE_OPTIONS);
  return res;
}
