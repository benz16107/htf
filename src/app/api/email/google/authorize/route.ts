import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { buildGoogleAuthorizeUrl } from "@/server/email/google";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/sign-in", getRequestOrigin(request)));
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/dashboard/integrations";

  try {
    const authUrl = buildGoogleAuthorizeUrl(getRequestOrigin(request), session.companyId, redirectTo);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;max-width:680px">
        <h1>Google email is not configured</h1>
        <p>${error instanceof Error ? error.message : "Missing Google OAuth configuration."}</p>
        <p>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>${process.env.GOOGLE_REDIRECT_URI ? "" : " (and optionally GOOGLE_REDIRECT_URI)"} to your environment, then restart the dev server.</p>
        <p><a href="${redirectTo}">Back</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" }, status: 503 }
    );
  }
}
