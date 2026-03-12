import { db } from "@/lib/db";

const PROVIDER = "google_email";
const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_OAUTH_SCOPES = [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE];

type GoogleEmailMetadata = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  emailAddress?: string;
  scope?: string;
  historyId?: string;
  watchExpiration?: string;
  lastNotificationAt?: string;
  lastWatchError?: string;
};

export type DirectEmailConnectionStatus = {
  provider: "gmail";
  connected: boolean;
  emailAddress: string | null;
  oauthReady: boolean;
  sendReady: boolean;
  pushReady: boolean;
  watchActive: boolean;
  watchExpiration: string | null;
  pushTopicName: string | null;
  pushEndpointUrl: string | null;
  lastWatchError: string | null;
};

export type DirectGmailMessage = {
  externalId: string;
  source: string;
  toolName: string;
  summary: string;
  raw: Record<string, unknown>;
};

function hasGoogleScope(scopeValue: string | undefined, wantedScope: string): boolean {
  return (scopeValue || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(wantedScope);
}

function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

function getGoogleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

function getGooglePubsubTopicName(): string | null {
  return process.env.GOOGLE_PUBSUB_TOPIC_NAME?.trim() || null;
}

function getGooglePubsubVerificationToken(): string | null {
  return process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN?.trim() || null;
}

export function isGoogleEmailOauthConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function isGoogleEmailPushConfigured(): boolean {
  return Boolean(getGooglePubsubTopicName() && getGooglePubsubVerificationToken());
}

function getGoogleRedirectUri(origin: string): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${origin}/api/email/google/callback`;
}

export function getGooglePushEndpoint(origin: string): string | null {
  const token = getGooglePubsubVerificationToken();
  if (!token) return null;
  const url = new URL("/api/email/google/push", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function encodeState(payload: Record<string, string>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeGoogleState(state: string | null): Record<string, string> | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizeUrl(origin: string, companyId: string, redirectTo: string): string {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set(
    "state",
    encodeState({
      companyId,
      redirectTo,
    })
  );
  return url.toString();
}

async function getConnectionRow(companyId: string) {
  return db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true, status: true, connectedAt: true, createdAt: true, lastSyncAt: true },
  });
}

function getMetadata(row: Awaited<ReturnType<typeof getConnectionRow>>): GoogleEmailMetadata {
  return ((row?.metadata as GoogleEmailMetadata | null) ?? {});
}

export async function getGoogleEmailConnectionStatus(companyId: string): Promise<DirectEmailConnectionStatus> {
  const row = await getConnectionRow(companyId);
  const meta = getMetadata(row);
  const watchExpirationMs = meta.watchExpiration ? Date.parse(meta.watchExpiration) : 0;
  return {
    provider: "gmail",
    connected: row?.status === "connected" && Boolean(meta.refreshToken || meta.accessToken),
    emailAddress: meta.emailAddress ?? null,
    oauthReady: isGoogleEmailOauthConfigured(),
    sendReady: hasGoogleScope(meta.scope, GMAIL_SEND_SCOPE),
    pushReady: isGoogleEmailPushConfigured(),
    watchActive: watchExpirationMs > Date.now(),
    watchExpiration: meta.watchExpiration ?? null,
    pushTopicName: getGooglePubsubTopicName(),
    pushEndpointUrl: null,
    lastWatchError: meta.lastWatchError ?? null,
  };
}

async function saveGoogleConnection(companyId: string, metadata: GoogleEmailMetadata): Promise<void> {
  const existing = await getConnectionRow(companyId);
  const prev = getMetadata(existing);
  const next: GoogleEmailMetadata = {
    ...prev,
    ...metadata,
    refreshToken: metadata.refreshToken ?? prev.refreshToken,
    scope: metadata.scope ?? prev.scope,
    emailAddress: metadata.emailAddress ?? prev.emailAddress,
  };
  await db.integrationConnection.upsert({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    create: {
      companyId,
      provider: PROVIDER,
      status: "connected",
      authType: "oauth",
      metadata: next,
    },
    update: {
      status: "connected",
      authType: "oauth",
      metadata: next,
    },
  });
}

export async function setGooglePushEndpointForStatus(companyId: string, origin: string): Promise<DirectEmailConnectionStatus> {
  const status = await getGoogleEmailConnectionStatus(companyId);
  return {
    ...status,
    pushEndpointUrl: getGooglePushEndpoint(origin),
  };
}

export async function disconnectGoogleEmail(companyId: string): Promise<void> {
  await db.integrationConnection.deleteMany({
    where: { companyId, provider: PROVIDER },
  });
}

export async function exchangeGoogleCodeForTokens(args: {
  code: string;
  origin: string;
  companyId: string;
}): Promise<void> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth env vars are not configured.");
  }

  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(args.origin),
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Google token exchange failed (${tokenRes.status}).`);
  }

  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    cache: "no-store",
  });
  const profileData = (await profileRes.json().catch(() => ({}))) as { emailAddress?: string };

  await saveGoogleConnection(args.companyId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt:
      typeof tokenData.expires_in === "number"
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : undefined,
    emailAddress: profileData.emailAddress,
    scope: tokenData.scope,
  });
}

async function refreshGoogleAccessToken(companyId: string, refreshToken: string): Promise<GoogleEmailMetadata> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth env vars are not configured.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to refresh Gmail access token (${res.status}).`);
  }

  const next: GoogleEmailMetadata = {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    scope: data.scope,
  };
  await saveGoogleConnection(companyId, next);
  return next;
}

async function getValidGoogleAccessToken(companyId: string): Promise<{ accessToken: string; emailAddress?: string }> {
  const row = await getConnectionRow(companyId);
  const meta = getMetadata(row);
  if (!row || row.status !== "connected") {
    throw new Error("Gmail is not connected.");
  }

  const expiresAtMs = meta.expiresAt ? Date.parse(meta.expiresAt) : 0;
  const stillValid = meta.accessToken && expiresAtMs > Date.now() + 60_000;
  if (stillValid) {
    return { accessToken: meta.accessToken!, emailAddress: meta.emailAddress };
  }

  if (!meta.refreshToken) {
    throw new Error("Gmail refresh token is missing. Reconnect Gmail.");
  }

  const refreshed = await refreshGoogleAccessToken(companyId, meta.refreshToken);
  return { accessToken: refreshed.accessToken!, emailAddress: meta.emailAddress };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGoogleConnectionMetadata(companyId: string): Promise<GoogleEmailMetadata> {
  const row = await getConnectionRow(companyId);
  return getMetadata(row);
}

async function updateGoogleMetadata(companyId: string, metadata: GoogleEmailMetadata): Promise<void> {
  await saveGoogleConnection(companyId, metadata);
}

function decodeBase64Url(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBodyFromPayload(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "";
  const bodyData =
    payload.body && typeof payload.body === "object"
      ? ((payload.body as { data?: string }).data ?? null)
      : null;
  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
  if (bodyData && mimeType === "text/plain") {
    return decodeBase64Url(bodyData);
  }

  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const partObj = part as Record<string, unknown>;
    const text = extractBodyFromPayload(partObj);
    if (text.trim()) return text;
  }

  if (bodyData) return decodeBase64Url(bodyData);
  return "";
}

function getHeader(headers: unknown[], name: string): string | null {
  for (const item of headers) {
    if (!item || typeof item !== "object") continue;
    const header = item as { name?: string; value?: string };
    if (header.name?.toLowerCase() === name.toLowerCase() && typeof header.value === "string") {
      return header.value;
    }
  }
  return null;
}

function getGmailMessageTimestamp(raw: Record<string, unknown>): number | null {
  const internalDate = raw.internalDate;
  if (typeof internalDate === "string" && /^\d+$/.test(internalDate)) {
    const ms = Number(internalDate);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  const dateValue = raw.date;
  if (typeof dateValue === "string") {
    const ms = Date.parse(dateValue);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

async function fetchGmailMessageDetails(accessToken: string, messageId: string): Promise<DirectGmailMessage | null> {
  const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);
  detailUrl.searchParams.set("format", "full");
  const res = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return null;
  const labelIds = Array.isArray(data.labelIds) ? data.labelIds.map((v) => String(v)) : [];
  if (labelIds.length > 0 && !labelIds.includes("INBOX")) return null;
  const payload = (data.payload as Record<string, unknown> | undefined) ?? undefined;
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  const subject = getHeader(headers, "Subject") || "New email";
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const date = getHeader(headers, "Date");
  const body = extractBodyFromPayload(payload);
  const snippet = typeof data.snippet === "string" ? data.snippet : "";
  const raw = {
    id: String(data.id ?? messageId),
    threadId: typeof data.threadId === "string" ? data.threadId : undefined,
    subject,
    from,
    to,
    date,
    snippet,
    body,
    labelIds,
    internalDate: typeof data.internalDate === "string" ? data.internalDate : undefined,
  } satisfies Record<string, unknown>;
  const summary = [subject, from ? `from ${from}` : null, snippet || body ? `- ${(snippet || body).slice(0, 140)}` : null]
    .filter(Boolean)
    .join(" ");

  return {
    externalId: String(data.id ?? messageId),
    source: "gmail",
    toolName: "gmail_direct",
    summary: summary || subject,
    raw: raw as Record<string, unknown>,
  };
}

export async function listRecentGmailMessages(companyId: string, limit = 20): Promise<DirectGmailMessage[]> {
  const row = await getConnectionRow(companyId);
  let baselineMs =
    row?.lastSyncAt?.getTime() ??
    row?.connectedAt?.getTime() ??
    row?.createdAt?.getTime() ??
    null;
  if (baselineMs != null && baselineMs > Date.now() + 5 * 60 * 1000) {
    // Guard against accidental future checkpoints that would hide all mail.
    baselineMs = null;
  }
  const baselineGraceMs = 2 * 60 * 1000;
  const { accessToken } = await getValidGoogleAccessToken(companyId);
  const listMessages = async (query: string): Promise<Array<{ id: string; threadId?: string }>> => {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", String(Math.min(limit, 50)));
    listUrl.searchParams.set("q", query);
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const listData = (await listRes.json().catch(() => ({}))) as {
      messages?: Array<{ id: string; threadId?: string }>;
    };
    if (!listRes.ok) {
      throw new Error(`Failed to list Gmail messages (${listRes.status}).`);
    }
    return Array.isArray(listData.messages) ? listData.messages : [];
  };

  let messages = await listMessages("in:inbox newer_than:30d");
  if (messages.length === 0) {
    // Fallback query helps when Gmail search syntax/age window excludes expected items.
    messages = await listMessages("in:inbox");
  }
  const details = await Promise.all(messages.map((m) => fetchGmailMessageDetails(accessToken, m.id)));

  return details.filter((item): item is NonNullable<typeof item> => {
    if (item == null) return false;
    if (baselineMs == null) return true;
    const ts = getGmailMessageTimestamp(item.raw);
    return ts == null || ts > baselineMs - baselineGraceMs;
  }) as DirectGmailMessage[];
}

export async function markGoogleEmailSync(companyId: string, syncedAt: Date = new Date()): Promise<void> {
  await db.integrationConnection.updateMany({
    where: { companyId, provider: PROVIDER },
    data: { lastSyncAt: syncedAt },
  });
}

export async function sendGmailEmail(args: {
  companyId: string;
  to: string | string[];
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    mimeType?: string;
    contentBase64: string;
  }>;
}): Promise<void> {
  const meta = await getGoogleConnectionMetadata(args.companyId);
  if (!hasGoogleScope(meta.scope, GMAIL_SEND_SCOPE)) {
    throw new Error("Gmail send permission is missing. Reconnect Gmail to grant send access.");
  }

  const { accessToken, emailAddress } = await getValidGoogleAccessToken(args.companyId);
  const toList = Array.isArray(args.to) ? args.to.filter(Boolean) : [args.to].filter(Boolean);
  if (toList.length === 0) {
    throw new Error("No email recipient provided.");
  }

  const attachments = Array.isArray(args.attachments) ? args.attachments.filter((a) => a?.filename && a?.contentBase64) : [];
  let rawMessage = "";
  if (attachments.length === 0) {
    const lines = [
      `To: ${toList.join(", ")}`,
      ...(emailAddress ? [`From: ${emailAddress}`] : []),
      `Subject: ${args.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      args.body,
    ];
    rawMessage = lines.join("\r\n");
  } else {
    const boundary = `htf-boundary-${Date.now()}`;
    const lines: string[] = [
      `To: ${toList.join(", ")}`,
      ...(emailAddress ? [`From: ${emailAddress}`] : []),
      `Subject: ${args.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      args.body,
      "",
    ];
    for (const attachment of attachments) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "",
        attachment.contentBase64,
        ""
      );
    }
    lines.push(`--${boundary}--`, "");
    rawMessage = lines.join("\r\n");
  }
  const raw = encodeBase64Url(rawMessage);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to send Gmail message (${res.status}).`);
  }
}

export async function startGmailWatch(companyId: string): Promise<{ historyId: string; expiration: string }> {
  const topicName = getGooglePubsubTopicName();
  if (!topicName) {
    throw new Error("GOOGLE_PUBSUB_TOPIC_NAME is not configured.");
  }

  const { accessToken } = await getValidGoogleAccessToken(companyId);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { historyId?: string; expiration?: string; error?: { message?: string } };
  if (!res.ok || !data.historyId || !data.expiration) {
    const message = data?.error?.message || `Failed to start Gmail watch (${res.status}).`;
    await updateGoogleMetadata(companyId, { lastWatchError: message });
    throw new Error(message);
  }

  const expirationIso = new Date(Number(data.expiration)).toISOString();
  await updateGoogleMetadata(companyId, {
    historyId: data.historyId,
    watchExpiration: expirationIso,
    lastWatchError: "",
  });
  return { historyId: data.historyId, expiration: expirationIso };
}

export async function renewExpiringGmailWatches(): Promise<{ checked: number; renewed: number; failed: number }> {
  const rows = await db.integrationConnection.findMany({
    where: { provider: PROVIDER, status: "connected" },
    select: { companyId: true, metadata: true },
  });

  let renewed = 0;
  let failed = 0;
  for (const row of rows) {
    const meta = (row.metadata as GoogleEmailMetadata | null) ?? {};
    const watchExpirationMs = meta.watchExpiration ? Date.parse(meta.watchExpiration) : 0;
    const shouldRenew = !watchExpirationMs || watchExpirationMs < Date.now() + 24 * 60 * 60 * 1000;
    if (!shouldRenew) continue;

    try {
      await startGmailWatch(row.companyId);
      renewed++;
    } catch (err) {
      failed++;
      console.error(`Failed to renew Gmail watch for company ${row.companyId}:`, err);
    }
  }

  return { checked: rows.length, renewed, failed };
}

export function isValidGooglePushToken(token: string | null | undefined): boolean {
  const expected = getGooglePubsubVerificationToken();
  return Boolean(expected && token && token === expected);
}

export async function findCompanyIdByGoogleEmailAddress(emailAddress: string): Promise<string | null> {
  const rows = await db.integrationConnection.findMany({
    where: { provider: PROVIDER, status: "connected" },
    select: { companyId: true, metadata: true },
  });
  const match = rows.find((row) => {
    const meta = (row.metadata as GoogleEmailMetadata | null) ?? {};
    return meta.emailAddress?.toLowerCase() === emailAddress.toLowerCase();
  });
  return match?.companyId ?? null;
}

export async function fetchGmailMessagesSinceHistory(companyId: string, latestHistoryId: string): Promise<DirectGmailMessage[]> {
  const row = await getConnectionRow(companyId);
  const meta = getMetadata(row);
  const startHistoryId = meta.historyId;
  if (!startHistoryId) {
    await updateGoogleMetadata(companyId, {
      historyId: latestHistoryId,
      lastNotificationAt: new Date().toISOString(),
    });
    return [];
  }

  const { accessToken } = await getValidGoogleAccessToken(companyId);
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("startHistoryId", startHistoryId);
  url.searchParams.set("historyTypes", "messageAdded");
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
    historyId?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    if (res.status === 404) {
      await updateGoogleMetadata(companyId, {
        historyId: latestHistoryId,
        lastNotificationAt: new Date().toISOString(),
        lastWatchError: "history_reset",
      });
      return [];
    }
    const message = data?.error?.message || `Failed to read Gmail history (${res.status}).`;
    await updateGoogleMetadata(companyId, { lastWatchError: message });
    throw new Error(message);
  }

  const ids = new Set<string>();
  for (const entry of Array.isArray(data.history) ? data.history : []) {
    const added = Array.isArray(entry.messagesAdded) ? entry.messagesAdded : [];
    for (const item of added) {
      const id = item?.message?.id;
      if (typeof id === "string" && id) ids.add(id);
    }
  }

  const messages = await Promise.all([...ids].map((id) => fetchGmailMessageDetails(accessToken, id)));
  await updateGoogleMetadata(companyId, {
    historyId: data.historyId || latestHistoryId,
    lastNotificationAt: new Date().toISOString(),
    lastWatchError: "",
  });

  return messages.filter((item): item is NonNullable<typeof item> => item !== null) as DirectGmailMessage[];
}
