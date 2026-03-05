import { NextResponse } from "next/server";

/**
 * Redirects to Zapier OAuth so you can get a one-time code, then get tokens
 * at /api/zapier/callback. Call this when ZAPIER_CLIENT_ID and ZAPIER_REDIRECT_URI are set.
 */
export async function GET() {
  const clientId = process.env.ZAPIER_CLIENT_ID?.trim();
  const redirectUri = process.env.ZAPIER_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Set ZAPIER_CLIENT_ID and ZAPIER_REDIRECT_URI in .env first. Then visit this URL again.",
      },
      { status: 400 }
    );
  }

  const scope = "zap zap:write authentication";
  const state = "one-time-setup";
  const authUrl = new URL("https://api.zapier.com/v2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
