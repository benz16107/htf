/**
 * Server-side Zapier API client. Uses a single global Zapier account (env vars)
 * for all companies. Later: per-company OAuth when Zapier app is published.
 */

const ZAPIER_API = "https://api.zapier.com/v2";
const ZAPIER_TOKEN_URL = "https://zapier.com/oauth/token/";

/**
 * Returns the access token for the platform's shared Zapier account.
 * Reads ZAPIER_ACCESS_TOKEN from env. If ZAPIER_REFRESH_TOKEN + client id/secret
 * are set, refreshes when the access token is expired (we don't persist refreshed
 * token to env, so next deploy or restart will use env again).
 */
export async function getGlobalZapierAccessToken(): Promise<string | null> {
  const accessToken = process.env.ZAPIER_ACCESS_TOKEN?.trim();
  if (accessToken) return accessToken;

  const refreshToken = process.env.ZAPIER_REFRESH_TOKEN?.trim();
  const clientId = process.env.ZAPIER_CLIENT_ID?.trim();
  const clientSecret = process.env.ZAPIER_CLIENT_SECRET?.trim();
  if (!refreshToken || !clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(ZAPIER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    console.error("Zapier token refresh failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.access_token ?? null;
}

export async function zapierGet<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string>
): Promise<T> {
  const url = new URL(path, ZAPIER_API);
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zapier API ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

/** GET /v2/apps - list apps (directory). */
export async function listApps(accessToken: string): Promise<{ data: { type: string; id: string; title: string }[] }> {
  return zapierGet<{ data: { type: string; id: string; title: string }[] }>("/apps", accessToken);
}

/** GET /v2/authentications?app={appId} - list connected authentications for an app. */
export async function listAuthentications(
  accessToken: string,
  appId: string
): Promise<{
  data: { type: string; id: string; app: string; is_expired: boolean; title: string }[];
}> {
  return zapierGet<{
    data: { type: string; id: string; app: string; is_expired: boolean; title: string }[];
  }>("/authentications", accessToken, { app: appId });
}

/** POST /v2/action-runs - trigger a Zapier action (e.g. send email via Gmail). */
export async function createActionRun(
  accessToken: string,
  params: { action: string; authentication: string; input: Record<string, unknown> }
): Promise<{ data: { type: string; id: string } }> {
  const res = await fetch(`${ZAPIER_API}/action-runs/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: params.action,
      authentication: params.authentication,
      input: params.input,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zapier action run failed: ${res.status} ${text}`);
  }
  return res.json();
}
