import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { decodeGoogleState, exchangeGoogleCodeForTokens, isGoogleEmailPushConfigured, startGmailWatch } from "@/server/email/google";

export async function GET(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");
  const state = decodeGoogleState(url.searchParams.get("state"));
  const redirectTo = state?.redirectTo || "/dashboard/integrations";

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  if (state?.companyId && state.companyId !== session.companyId) {
    return NextResponse.redirect(new URL(`${redirectTo}?emailError=company_mismatch`, origin));
  }

  if (errorParam) {
    return NextResponse.redirect(new URL(`${redirectTo}?emailError=${encodeURIComponent(errorParam)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`${redirectTo}?emailError=missing_code`, origin));
  }

  try {
    await exchangeGoogleCodeForTokens({
      code,
      origin,
      companyId: session.companyId,
    });
    let nextUrl = `${redirectTo}?emailConnected=gmail`;
    if (isGoogleEmailPushConfigured()) {
      try {
        await startGmailWatch(session.companyId);
        nextUrl += "&emailPush=enabled";
      } catch (watchError) {
        const msg = watchError instanceof Error ? watchError.message : "push_watch_failed";
        nextUrl += `&emailPushError=${encodeURIComponent(msg)}`;
      }
    }
    return NextResponse.redirect(new URL(nextUrl, origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "connect_failed";
    return NextResponse.redirect(new URL(`${redirectTo}?emailError=${encodeURIComponent(message)}`, origin));
  }
}
