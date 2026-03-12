import crypto from "crypto";
import { db } from "@/lib/db";

type TriggerAutonomousRunArgs = {
  companyId: string;
  eventIds: string[];
  origin?: string | null;
  cookieHeader?: string | null;
};

function getLiveIngestSecret(): string | null {
  return (
    process.env.INTERNAL_API_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.ZAPIER_MCP_EMBED_SECRET?.trim() ||
    null
  );
}

function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickObject(obj: unknown, keys: string[]): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function looksLikeInboundEmail(obj: unknown): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return [
    "subject",
    "from",
    "sender",
    "snippet",
    "body",
    "message",
    "textBody",
    "bodyPlain",
    "plainText",
    "receivedAt",
    "received_at",
  ].some((key) => key in record);
}

export function createLiveIngestToken(companyId: string): string | null {
  const secret = getLiveIngestSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(`live-ingest:${companyId}`).digest("hex");
}

export function isValidLiveIngestToken(companyId: string, token: string | null | undefined): boolean {
  const expected = createLiveIngestToken(companyId);
  if (!expected || !token?.trim()) return false;
  const provided = token.trim();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function extractLiveInboundItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
  }
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const keys = ["events", "emails", "items", "messages", "results", "data", "records"];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item));
    }
    if (looksLikeInboundEmail(value)) {
      return [value as Record<string, unknown>];
    }
  }

  return looksLikeInboundEmail(record) ? [record] : [];
}

export function getInboundExternalId(raw: unknown): string | null {
  const direct = pickString(raw, [
    "externalId",
    "external_id",
    "messageId",
    "message_id",
    "emailId",
    "email_id",
    "id",
  ]);
  if (direct) return direct;

  const headers = pickObject(raw, ["headers", "payload"]);
  return (
    pickString(headers, ["messageId", "message_id"]) ||
    pickString(pickObject(headers, ["headers"]), ["messageId", "message_id"]) ||
    null
  );
}

export function buildInboundSignalSummary(raw: unknown, fallbackSource = "Email"): string {
  const subject = pickString(raw, ["subject", "title"]) || "New email";
  const fromObj = pickObject(raw, ["from", "sender"]);
  const from =
    pickString(fromObj, ["email", "address", "name"]) ||
    pickString(raw, ["from", "sender", "from_email", "fromEmail"]);
  const snippet =
    pickString(raw, ["snippet", "preview", "summary"]) ||
    pickString(raw, ["body", "bodyPlain", "body_plain", "textBody", "plainText", "message", "text"]);

  const parts = [subject];
  if (from) parts.push(`from ${from}`);
  if (snippet) parts.push(`- ${snippet.slice(0, 140)}`);
  const summary = parts.join(" ").trim();
  return summary || `${fallbackSource} signal`;
}

export function getInboundSource(payload: unknown): string {
  return pickString(payload, ["source", "provider", "app", "appName"]) || "zapier";
}

export function getInboundToolName(payload: unknown): string {
  return pickString(payload, ["toolName", "tool", "triggerName", "trigger", "zapName"]) || "zapier_live_email";
}

export async function triggerAutonomousRunForEvents({
  companyId,
  eventIds,
  origin,
  cookieHeader,
}: TriggerAutonomousRunArgs): Promise<void> {
  if (eventIds.length === 0) return;

  const normalizeSignalSources = (value: string | null | undefined): "internal_only" | "external_only" | "both" => {
    const v = (value ?? "").toLowerCase().trim().replace(/\s+/g, "_");
    if (v === "internal_only" || v === "internal") return "internal_only";
    if (v === "external_only" || v === "external") return "external_only";
    return "both";
  };
  const normalizeInternalMode = (value: string | null | undefined): "live" | "lookback" => {
    const v = (value ?? "").toLowerCase().trim().replace(/\s+/g, "_");
    return v === "live" ? "live" : "lookback";
  };

  const config = await db.autonomousAgentConfig.findUnique({
    where: { companyId },
  });
  const mode = normalizeInternalMode((config as { internalSignalMode?: string } | null)?.internalSignalMode);
  const sources = normalizeSignalSources(config?.signalSources);
  const level = config?.automationLevel ?? "off";
  const running = Boolean(config?.agentRunning);
  if (!running || mode !== "live" || (sources !== "internal_only" && sources !== "both") || level === "off") {
    console.info(
      "[live-trigger] skip company=%s running=%s mode=%s sources=%s level=%s events=%d",
      companyId,
      running,
      mode,
      sources,
      level,
      eventIds.length
    );
    return;
  }

  const base =
    origin ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = base.startsWith("http") ? base : `https://${base}`;
  const internalSecret = getLiveIngestSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (internalSecret) headers["x-internal-secret"] = internalSecret;

  const res = await fetch(`${url}/api/agents/autonomous/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ eventIds, companyId }),
    cache: "no-store",
  });
  console.info(
    "[live-trigger] run request company=%s events=%d status=%d",
    companyId,
    eventIds.length,
    res.status
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Live trigger run failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
