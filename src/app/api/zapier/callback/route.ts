import { NextResponse } from "next/server";

/**
 * One-time OAuth callback for Zapier. After you authorize in the browser,
 * Zapier redirects here with ?code=... We exchange the code for tokens
 * and show them so you can copy into .env (ZAPIER_ACCESS_TOKEN, ZAPIER_REFRESH_TOKEN).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;max-width:600px">
        <h1>Zapier OAuth error</h1>
        <p>${errorParam}</p>
        <p><a href="/setup/integrations">Back to Integrations</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;max-width:600px">
        <h1>Missing code</h1>
        <p>Zapier did not return a code. Try the authorize link again.</p>
        <p><a href="/setup/integrations">Back to Integrations</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const clientId = process.env.ZAPIER_CLIENT_ID;
  const clientSecret = process.env.ZAPIER_CLIENT_SECRET;
  const redirectUri = process.env.ZAPIER_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;max-width:600px">
        <h1>Env not set</h1>
        <p>Add ZAPIER_CLIENT_ID, ZAPIER_CLIENT_SECRET, and ZAPIER_REDIRECT_URI to .env and restart the dev server.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://zapier.com/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;max-width:600px">
        <h1>Token exchange failed</h1>
        <p>${res.status} ${JSON.stringify(data)}</p>
        <p><a href="/setup/integrations">Back to Integrations</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const accessToken = data.access_token ?? "";
  const refreshToken = data.refresh_token ?? "";

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Zapier tokens</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:700px;line-height:1.5">
  <h1>Copy these into your .env</h1>
  <p>Add or update these lines in your project's <code>.env</code> file, then restart the dev server.</p>
  <div style="background:#f5f5f5;padding:1rem;border-radius:8px;margin:1rem 0;overflow-x:auto">
    <pre style="margin:0;font-size:0.9rem">ZAPIER_ACCESS_TOKEN=${accessToken}
ZAPIER_REFRESH_TOKEN=${refreshToken}
ZAPIER_CLIENT_ID=${clientId}
ZAPIER_CLIENT_SECRET=${clientSecret}
ZAPIER_REDIRECT_URI=${redirectUri}</pre>
  </div>
  <p><strong>Important:</strong> Keep these secret. Do not commit .env to git.</p>
  <p><a href="/setup/integrations">Back to Integrations</a></p>
</body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
