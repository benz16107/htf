import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRequestOrigin } from "@/lib/request-origin";
import { isNonRiskNotification } from "@/lib/signal-filters";
import { getGoogleEmailConnectionStatus, listRecentGmailMessages, markGoogleEmailSync } from "@/server/email/google";
import { triggerAutonomousRunForEvents } from "@/server/risk/live-internal-signals";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "@/server/zapier/mcp-config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function isFollowUpOrError(text: string): boolean {
  const t = text.trim();
  if (t.startsWith("{") && (t.includes("followUpQuestion") || t.includes("isPreview"))) return true;
  if (/I wasn't able to determine the value for/i.test(t)) return true;
  if (/Could you (provide|specify|clarify)/i.test(t) && t.length < 400) return true;
  if (/I'm specialized in the/i.test(t) && /don't currently have available/i.test(t)) return true;
  return false;
}

function isSetupOrConfigNoise(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("get_configuration_url")) return true;
  if (/https?:\/\/mcp\.zapier\.com\/mcp\/servers\/[^/\s]+\/config/i.test(text)) return true;
  return false;
}

function textFromRawItem(raw: unknown): string[] {
  const out: string[] = [];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["subject", "snippet", "body", "title", "content", "message"]) {
      const v = o[k];
      if (typeof v === "string") out.push(v);
    }
    const from = o.from ?? o.sender;
    if (from && typeof from === "object") {
      const name = (from as { name?: string }).name;
      const email = (from as { email?: string }).email;
      if (typeof name === "string") out.push(name);
      if (typeof email === "string") out.push(email);
    }
  }
  return out;
}

/** Build a single text blob for one candidate (summary + subject/snippet/body) for the AI to judge. */
function contentForRiskCheck(summary: string, raw?: unknown): string {
  const parts = [summary].concat(textFromRawItem(raw));
  return parts.join(" ").trim().slice(0, 1200);
}

/**
 * Use AI to classify which items are risk-relevant (operational, compliance, or security risk).
 * Returns one boolean per item. If API key missing or request fails, returns all false (don't ingest unclassified).
 */
async function classifyRiskRelevance(
  items: { summary: string; raw?: unknown }[]
): Promise<boolean[]> {
  if (items.length === 0) return [];
  if (!process.env.GEMINI_API_KEY) return items.map(() => false);

  const blocks = items.map((item, i) => {
    const text = contentForRiskCheck(item.summary, item.raw);
    return `[Item ${i + 1}]\n${text || "(no content)"}`;
  });

  const prompt = `You are a risk analyst. For each item below (email or message summary and content), decide if it could relate to OPERATIONAL, COMPLIANCE, or SECURITY risk, supply chain, vendors, or business disruption. Include: incidents, breaches, complaints, legal/regulatory, outages, fraud, audits, recalls, security alerts, disputes, claims, failures, escalations, supplier/vendor issues, delivery or quality concerns, and any business email that is not clearly only marketing or a shipping receipt. Exclude only: obvious marketing blasts, package-shipped/delivery notifications, welcome emails, and spam. When in doubt, include (risk_relevant: true). Return ONLY valid JSON, no markdown, in this exact shape: {"results":[{"risk_relevant":true},{"risk_relevant":false},...]} with one object per item in the same order.\n\n${blocks.join("\n\n")}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const text = response.text?.trim();
    if (!text) return items.map(() => false);
    const parsed = JSON.parse(text) as { results?: Array<{ risk_relevant?: boolean }> };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    return items.map((_, i) => Boolean(results[i]?.risk_relevant));
  } catch (err) {
    console.error("Ingest risk classification error:", err);
    return items.map(() => false);
  }
}

/** Extract only the exact information retrieved (no full agent/JSON response). */
function extractExactInformationSummary(rawText: string): string {
  const t = rawText.trim();
  if (!t) return "";
  if (isFollowUpOrError(t)) return "";

  try {
    const parsed = JSON.parse(t);
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const parsedObj = obj as Record<string, unknown>;
      const arr = (parsedObj.results ?? parsedObj.data ?? parsedObj.items ?? parsedObj.emails) as unknown[] | undefined;
      if (Array.isArray(arr) && arr.length > 0) {
        const lines: string[] = [];
        for (const it of arr.slice(0, 5)) {
          if (it && typeof it === "object") {
            const o = it as Record<string, unknown>;
            const subj = typeof o.subject === "string" ? o.subject : undefined;
            const from = o.from && typeof o.from === "object"
              ? ((o.from as { name?: string; email?: string }).name ?? (o.from as { email?: string }).email)
              : undefined;
            const title = typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : undefined;
            if (subj != null && from != null) lines.push(`Email: "${subj.slice(0, 60)}" from ${from}`);
            else if (title != null) lines.push(title.slice(0, 80));
            else lines.push(JSON.stringify(o).slice(0, 80));
          }
        }
        return lines.join(" · ");
      }
      const subj = parsedObj.subject;
      const from = parsedObj.from && typeof parsedObj.from === "object"
        ? ((parsedObj.from as { name?: string; email?: string }).name ?? (parsedObj.from as { email?: string }).email)
        : undefined;
      if (typeof subj === "string" && from) return `Email: "${subj.slice(0, 80)}" from ${from}`;
      const title = typeof parsedObj.title === "string" ? parsedObj.title : typeof parsedObj.name === "string" ? parsedObj.name : undefined;
      if (title) return title.slice(0, 200);
    }
  } catch {
    // not JSON
  }
  const stripped = t.replace(/^(Here are the results?|The following was retrieved|Result:)\s*/i, "").trim();
  return stripped.slice(0, 200);
}

function getTextFromContentPart(item: unknown): string | null {
  if (!item) return null;
  if (typeof item === "string") return item.trim() || null;
  if (typeof item === "object" && item !== null) {
    const o = item as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim() || null;
    if (Array.isArray(o.content)) {
      const first = o.content[0];
      if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
        return ((first as { text: string }).text).trim() || null;
      }
    }
  }
  return null;
}

function itemToSummary(item: unknown): string | null {
  const raw = getTextFromContentPart(item);
  if (raw) {
    const exact = extractExactInformationSummary(raw);
    return exact || null;
  }
  if (item && typeof item === "object") {
    const exact = extractExactInformationSummary(JSON.stringify(item));
    return exact || null;
  }
  return null;
}

/** Get array of email-like items from parsed Zapier response (various key names). */
function getEmailLikeArray(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  const keys = ["results", "data", "items", "emails", "messages", "output", "value", "response", "Results", "Data", "Items"];
  let arr: unknown[] | undefined;
  for (const k of keys) {
    const v = (parsed as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length > 0) {
      arr = v;
      break;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = arr.filter((it): it is Record<string, unknown> => it != null && typeof it === "object");
  if (out.length === 0) return [];
  const first = out[0] as Record<string, unknown>;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const innerKeys = ["emails", "messages", "items", "results", "data"];
    for (const ik of innerKeys) {
      const inner = first[ik];
      if (Array.isArray(inner) && inner.length > 0) {
        return inner.filter((it): it is Record<string, unknown> => it != null && typeof it === "object");
      }
    }
  }
  return out;
}

/** If the raw string is a JSON array, return it as array of objects; otherwise null. */
function parseAsArray(raw: string): Array<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter((it): it is Record<string, unknown> => it != null && typeof it === "object");
  } catch {
    return null;
  }
}

/** True if the object looks like a single email (from Zapier/Gmail), not a wrapper. */
function isEmailLikeObject(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  return ["subject", "from", "snippet", "body", "title", "message", "sender"].some((k) => k in o);
}

/** Extract clean email summaries from Gmail find/search result JSON — only the exact info retrieved. */
function* gmailResultsToSummaries(content: unknown[]): Generator<{ summary: string; raw: unknown }> {
  for (const item of content) {
    let raw: string | null = null;
    let parsed: Record<string, unknown> | null = null;

    if (item && typeof item === "object") {
      if (isEmailLikeObject(item)) {
        const r = item;
        const fromObj = r.from ?? r.sender ?? r.from_email;
        const from = fromObj && typeof fromObj === "object"
          ? String((fromObj as { name?: string }).name ?? (fromObj as { email?: string }).email ?? "Unknown")
          : String(fromObj ?? "Unknown");
        const subj = String(r.subject ?? r.title ?? r.snippet ?? "").slice(0, 80);
        const summary = subj ? `Email: "${subj}" from ${from}` : `Email from ${from}`;
        yield { summary, raw: r };
        continue;
      }
      if ("text" in item && typeof (item as { text: unknown }).text === "string") {
        raw = (item as { text: string }).text.trim();
      } else if ("content" in item && Array.isArray((item as { content: unknown }).content)) {
        const first = (item as { content: unknown[] }).content[0];
        if (first && typeof first === "object" && "text" in first && typeof (first as { text: string }).text === "string") {
          raw = (first as { text: string }).text.trim();
        }
      }
      if (!raw && typeof (item as { results?: unknown }).results !== "undefined") {
        const asRecord = item as Record<string, unknown>;
        const results = asRecord.results ?? asRecord.data ?? asRecord.items ?? asRecord.emails ?? asRecord.messages;
        if (Array.isArray(results) && results.length > 0) {
          parsed = asRecord;
        }
      }
    } else if (typeof item === "string") {
      raw = item.trim();
    }

    if (!parsed && raw && raw.length >= 2) {
      try {
        const p = JSON.parse(raw);
        if (p && typeof p === "object" && !Array.isArray(p)) parsed = p as Record<string, unknown>;
      } catch {
        const exact = extractExactInformationSummary(raw);
        if (exact) yield { summary: exact, raw: item };
        continue;
      }
    }

    if (parsed) {
      let arr = getEmailLikeArray(parsed);
      if (arr.length === 0 && raw) {
        const topLevelArray = parseAsArray(raw);
        if (topLevelArray) arr = topLevelArray;
      }
      if (arr.length > 0) {
        for (const r of arr.slice(0, 20)) {
          const fromObj = r.from ?? r.sender ?? r.from_email;
          const from = fromObj && typeof fromObj === "object"
            ? String((fromObj as { name?: string }).name ?? (fromObj as { email?: string }).email ?? "Unknown")
            : String(fromObj ?? "Unknown");
          const subj = String(r.subject ?? r.title ?? r.snippet ?? "").slice(0, 80);
          const summary = subj ? `Email: "${subj}" from ${from}` : `Email from ${from}`;
          yield { summary, raw: r };
        }
        continue;
      }
    }

    if (raw && raw.length >= 2 && !isFollowUpOrError(raw)) {
      const exact = extractExactInformationSummary(raw);
      if (exact) yield { summary: exact, raw: item };
    }
  }
}

function* contentToItems(content: unknown[], skipFollowUps = true): Generator<{ summary: string; raw: unknown }> {
  if (!content?.length) return;
  for (const item of content) {
    const summary = itemToSummary(item);
    if (!summary) continue;
    if (skipFollowUps && isFollowUpOrError(summary)) continue;
    if (isSetupOrConfigNoise(summary)) continue;
    if (isNonRiskNotification(summary)) continue;
    const rawText = textFromRawItem(item).join(" ");
    if (rawText && isSetupOrConfigNoise(rawText)) continue;
    if (rawText && isNonRiskNotification(rawText)) continue;
    yield { summary, raw: item };
  }
}

/** Extract a stable external id from a raw item (e.g. Gmail id/message_id) for deduplication. */
function getExternalId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = o.id ?? o.message_id ?? o.messageId;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number") return String(id);
  return null;
}

function getRawTimestampMs(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const candidates = [
    o.internalDate,
    o.receivedAt,
    o.received_at,
    o.sentAt,
    o.sent_at,
    o.createdAt,
    o.timestamp,
    o.date,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
    if (typeof value === "string" && value.trim()) {
      if (/^\d+$/.test(value.trim())) {
        const numeric = Number(value.trim());
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        }
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const payload = o.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return getRawTimestampMs(payload);
  }
  return null;
}

function isNewSince(raw: unknown, baseline: Date | null): boolean {
  if (!baseline) return true;
  const ts = getRawTimestampMs(raw);
  return ts == null || ts > baseline.getTime();
}

/** Only call tools that are read-style (find, search, list, get). Skip action tools (reply, send, remove, etc.). */
function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  const readPatterns = ["find", "search", "list", "get", "fetch", "read", "retrieve"];
  const actionPatterns = ["reply", "send", "remove", "add", "create", "update", "delete", "mark", "move", "label"];
  if (actionPatterns.some((a) => lower.includes(a))) return false;
  return readPatterns.some((r) => lower.includes(r));
}

/** Skip tools that require user-specific args we can't provide during auto ingest (e.g. attachment filename, file ID). */
function isIngestibleWithoutUserInput(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  if (lower.includes("get_configuration_url") || lower.includes("configuration_url")) return false;
  if (lower.includes("attachment_by_filename") || lower.includes("get_attachment")) return false;
  if (lower.includes("by_id") && (lower.includes("retrieve") || lower.includes("file") || lower.includes("folder"))) return false;
  if (lower.includes("by_filename")) return false;
  return true;
}

/** Zapier MCP tools require an "instructions" string. Provide a natural-language request per tool type. */
function getDefaultArgsForTool(toolName: string, syncedAfter: Date | null = null): Record<string, unknown> {
  const lower = toolName.toLowerCase();
  const isGmail = lower.includes("gmail");
  const isEmail = isGmail || lower.includes("outlook") || lower.includes("microsoft") || lower.includes("mail");
  const syncedAfterText = syncedAfter ? ` Only return items received after ${syncedAfter.toISOString()}.` : "";
  let instructions = "Return the 20 most recent items.";
  if (lower.includes("gmail_find") || lower.includes("gmail_find_email") || (isGmail && (lower.includes("find") || lower.includes("list")))) {
    instructions = `Get my 20 most recent emails from my primary inbox. Return each email as an object with subject, from (or sender), date, snippet, and body (or message) so we can read the content. Include new and unread emails.${syncedAfterText}`;
  } else if (isGmail && (lower.includes("search") || lower.includes("get"))) {
    instructions = `Search my Gmail inbox for the 20 most recent emails. Return subject, sender, date, snippet, and full message body (plain text) for each.${syncedAfterText}`;
  } else if (lower.includes("outlook") || lower.includes("microsoft")) {
    instructions = `Get my 20 most recent emails from my inbox. Return subject, sender, date, snippet, and message body for each.${syncedAfterText}`;
  } else if (lower.includes("drive") && lower.includes("retrieve")) {
    instructions = "List my 20 most recently modified files or folders (or recent items I have access to).";
  } else if (lower.includes("list") || lower.includes("search") || lower.includes("find")) {
    instructions = "Return up to 20 of the most recent or relevant items.";
  }
  const base: Record<string, unknown> = {
    instructions,
    limit: 20,
    max_results: 20,
    maxResults: 20,
    include_body: isEmail ? true : undefined,
    includeBody: isEmail ? true : undefined,
  };
  if (isGmail) {
    base.search_string = "in:inbox";
    base.query = "in:inbox";
    base.q = "in:inbox";
  }
  return base;
}

/**
 * POST /api/risk/ingest
 * Calls each of the company's input-context Zapier MCP tools to fetch recent data (e.g. emails),
 * then stores results as IngestedEvent so Signals & Risk/Impact Analysis can show live signals.
 * When autonomous agent has internalSignalMode "live", triggers a run for the newly created events.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let requestedReceivedAfter: Date | null = null;
  try {
    const body = await req.json();
    if (body && typeof body === "object" && typeof (body as { receivedAfter?: unknown }).receivedAfter === "string") {
      const parsed = new Date((body as { receivedAfter: string }).receivedAfter);
      if (!Number.isNaN(parsed.getTime())) {
        requestedReceivedAfter = parsed;
      }
    }
  } catch {
    // no JSON body provided
  }

  const [config, toolSelections, gmailStatus, zapierSyncState] = await Promise.all([
    getZapierMCPConfigForCompany(session.companyId),
    getZapierMCPToolSelections(session.companyId),
    getGoogleEmailConnectionStatus(session.companyId),
    db.integrationConnection.findUnique({
      where: { companyId_provider: { companyId: session.companyId, provider: "zapier_mcp" } },
      select: { connectedAt: true, lastSyncAt: true },
    }),
  ]);

  const inputContextTools = toolSelections.inputContextTools;
  const hasDirectGmail = gmailStatus.connected;

  if (!config && !hasDirectGmail) {
    return NextResponse.json(
      { error: "No internal source connected. Connect Gmail directly or connect Zapier in Dashboard → Integrations." },
      { status: 503 }
    );
  }

  if (inputContextTools.length === 0 && !hasDirectGmail) {
    return NextResponse.json(
      { error: "No input-context tools configured. Assign tools in Integrations or connect Gmail directly." },
      { status: 400 }
    );
  }

  const isEmailLikeTool = (toolName: string) => /gmail|outlook|microsoft|mail|email/.test(toolName.toLowerCase());
  const readOnlyTools = config
    ? inputContextTools
        .filter((t) => isReadOnlyTool(t) && isIngestibleWithoutUserInput(t))
        .filter((t) => !(hasDirectGmail && isEmailLikeTool(t)))
    : [];
  if (readOnlyTools.length === 0 && !hasDirectGmail) {
    return NextResponse.json(
      { error: "No read-style tools in input context (e.g. Gmail Find Email, Search). Add find/search/list tools to the input context zone." },
      { status: 400 }
    );
  }

  const created: { id: string; source: string; toolName: string }[] = [];
  const toolResults: { name: string; status: "ok" | "empty" | "error"; count: number; rawCount?: number; parsedCount?: number; message?: string }[] = [];
  const sourceByTool = (name: string) => name.split(":")[0]?.trim() || name;
  const zapierEmailBaseline = zapierSyncState?.lastSyncAt ?? zapierSyncState?.connectedAt ?? null;
  const effectiveEmailBaseline =
    requestedReceivedAfter && zapierEmailBaseline
      ? new Date(Math.max(requestedReceivedAfter.getTime(), zapierEmailBaseline.getTime()))
      : (requestedReceivedAfter ?? zapierEmailBaseline ?? null);
  const syncCompletedAt = new Date();

  const isGmailEmailTool = (t: string) => {
    const lower = t.toLowerCase();
    return lower.includes("gmail") && (lower.includes("find") || lower.includes("search") || lower.includes("get") || lower.includes("list"));
  };

  if (hasDirectGmail) {
    try {
      // Direct Gmail already applies its own last-sync checkpoint.
      // Do not apply Zapier-derived baseline again here.
      const recentItems = await listRecentGmailMessages(session.companyId, 20);
      const parsedCount = recentItems.length;
      if (recentItems.length === 0) {
        toolResults.push({ name: "gmail_direct", status: "empty", count: 0, rawCount: 0, parsedCount: 0, message: "No recent Gmail messages" });
      } else {
        const normalized = recentItems.map((item) => ({ summary: item.summary, raw: item.raw }));
        const riskFlags = await classifyRiskRelevance(normalized);
        let riskItems = recentItems.filter((_, i) => riskFlags[i]);
        if (riskItems.length === 0 && recentItems.length > 0 && !isNonRiskNotification(recentItems[0].summary)) {
          riskItems = [recentItems[0]];
        }

        let added = 0;
        for (const item of riskItems) {
          const existing = await db.ingestedEvent.findFirst({
            where: {
              companyId: session.companyId,
              toolName: item.toolName,
              externalId: item.externalId,
            },
          });
          if (existing) continue;

          const event = await db.ingestedEvent.create({
            data: {
              companyId: session.companyId,
              source: item.source,
              toolName: item.toolName,
              externalId: item.externalId,
              rawContent: item.raw as Prisma.InputJsonValue,
              signalSummary: item.summary,
            },
          });
          created.push({ id: event.id, source: item.source, toolName: item.toolName });
          added++;
        }

        toolResults.push({
          name: "gmail_direct",
          status: "ok",
          count: added,
          rawCount: recentItems.length,
          parsedCount,
          message: added === 0 ? "All Gmail emails already ingested or skipped" : undefined,
        });
      }
      await markGoogleEmailSync(session.companyId, syncCompletedAt);
    } catch (err) {
      console.error("Direct Gmail ingest failed:", err);
      toolResults.push({
        name: "gmail_direct",
        status: "error",
        count: 0,
        message: err instanceof Error ? err.message : "Gmail sync failed",
      });
    }
  }

  for (const toolName of readOnlyTools) {
    try {
      const args = getDefaultArgsForTool(toolName, isEmailLikeTool(toolName) ? effectiveEmailBaseline : null);
      const result = await callZapierMCPTool(config, toolName, args);
      if (result.isError) {
        console.warn(`Ingest: ${toolName} returned isError`, JSON.stringify(result.content?.slice(0, 1)).slice(0, 300));
        toolResults.push({ name: toolName, status: "error", count: 0, rawCount: result.content?.length ?? 0, message: "Zapier returned an error" });
        continue;
      }
      if (!result.content?.length) {
        console.warn(`Ingest: ${toolName} returned empty content`);
        toolResults.push({ name: toolName, status: "empty", count: 0, rawCount: 0, message: "No data returned from Zapier—check the tool is connected and returns inbox emails" });
        continue;
      }

      const source = sourceByTool(toolName);
      let content = result.content;
      const rawContentLength = content.length;

      const first = content[0];
      if (first && typeof first === "object" && first !== null && !("text" in first) && "content" in first) {
        const inner = (first as { content: unknown[] }).content;
        if (Array.isArray(inner)) content = inner;
      }
      // Zapier MCP often returns a single part with .text containing JSON (array of emails or wrapper object)
      if (content.length === 1 && first && typeof first === "object" && first !== null && "text" in first) {
        const textVal = (first as { text: string }).text;
        if (typeof textVal === "string" && textVal.trim().length > 0) {
          try {
            const parsed = JSON.parse(textVal.trim());
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p) => p != null && typeof p === "object")) {
              content = parsed;
            } else if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
              const arr = getEmailLikeArray(parsed as Record<string, unknown>);
              if (arr.length > 0) content = arr;
            }
          } catch {
            // keep content as-is
          }
        }
      }

      const allItems = isGmailEmailTool(toolName)
        ? [...gmailResultsToSummaries(content)].slice(0, 20)
        : [...contentToItems(content)].slice(0, 20);
      const items = isEmailLikeTool(toolName) && effectiveEmailBaseline
        ? allItems.filter(({ raw }) => isNewSince(raw, effectiveEmailBaseline))
        : allItems;

      const parsedCount = items.length;
      if (items.length === 0) {
        const firstPart = content[0];
        const sample =
          firstPart && typeof firstPart === "object" && firstPart !== null
            ? { keys: Object.keys(firstPart), textPreview: getTextFromContentPart(firstPart)?.slice(0, 400) }
            : null;
        console.log(`Ingest: ${toolName} produced 0 items. Sample:`, JSON.stringify(sample));

        let fallback = content.length === 1 ? itemToSummary(content[0]) : itemToSummary(content);
        if (!fallback) {
          const rawText = getTextFromContentPart(content[0]);
          if (rawText && rawText.length > 10 && !isFollowUpOrError(rawText)) {
            fallback = rawText.slice(0, 200).trim();
            if (fallback.length === 200) fallback += "…";
          }
        }
        const fallbackRelevant = fallback && !isFollowUpOrError(fallback) && !isSetupOrConfigNoise(fallback) && !isNonRiskNotification(fallback)
          ? (await classifyRiskRelevance([{ summary: fallback, raw: content[0] }]))[0]
          : false;
        if (fallbackRelevant) {
          const externalId = getExternalId(content[0]);
          if (externalId) {
            const existing = await db.ingestedEvent.findFirst({
              where: { companyId: session.companyId, toolName, externalId },
            });
            if (existing) {
              toolResults.push({ name: toolName, status: "ok", count: 0, rawCount: rawContentLength, parsedCount: 0 });
              continue;
            }
          }
          const event = await db.ingestedEvent.create({
            data: {
              companyId: session.companyId,
              source,
              toolName,
              externalId: externalId ?? undefined,
              rawContent: content as object,
              signalSummary: fallback,
            },
          });
          created.push({ id: event.id, source, toolName });
          toolResults.push({ name: toolName, status: "ok", count: 1, rawCount: rawContentLength, parsedCount: 0, message: "1 event from fallback" });
        } else {
          toolResults.push({ name: toolName, status: "empty", count: 0, rawCount: rawContentLength, parsedCount: 0, message: "Zapier returned data but we couldn't parse emails—check response format" });
        }
        continue;
      }
      const riskFlags = await classifyRiskRelevance(items);
      let riskItems = items.filter((_, i) => riskFlags[i]);
      // If no emails were classified as risk-relevant but we have items, include the most recent one if it's not clearly a non-risk notification (so the autonomous agent can still assess or skip it)
      const isEmailTool = isGmailEmailTool(toolName) || /outlook|microsoft|mail|email/.test(toolName.toLowerCase());
      if (riskItems.length === 0 && items.length > 0 && isEmailTool) {
        const first = items[0];
        if (first && !isNonRiskNotification(first.summary)) {
          riskItems = [first];
        }
      }
      let added = 0;
      for (const { summary, raw } of riskItems) {
        const externalId = getExternalId(raw);
        if (externalId) {
          const existing = await db.ingestedEvent.findFirst({
            where: { companyId: session.companyId, toolName, externalId },
          });
          if (existing) continue;
        }
        const event = await db.ingestedEvent.create({
          data: {
            companyId: session.companyId,
            source,
            toolName,
            externalId: externalId ?? undefined,
            rawContent: (raw as object) ?? undefined,
            signalSummary: summary,
          },
        });
        created.push({ id: event.id, source, toolName });
        added++;
      }
      toolResults.push({
        name: toolName,
        status: "ok",
        count: added,
        rawCount: rawContentLength,
        parsedCount,
        message: added === 0 && parsedCount > 0 ? "All emails already ingested or skipped" : undefined,
      });
    } catch (err) {
      console.error(`Zapier ingest failed for tool ${toolName}:`, err);
      toolResults.push({ name: toolName, status: "error", count: 0, message: err instanceof Error ? err.message : "Tool call failed" });
    }
  }

  if (config) {
    await db.integrationConnection.updateMany({
      where: { companyId: session.companyId, provider: "zapier_mcp" },
      data: { lastSyncAt: syncCompletedAt },
    });
  }

  // When internal signals are "live", trigger autonomous run for the new events so a case starts immediately.
  if (created.length > 0 && session.companyId) {
    try {
      await triggerAutonomousRunForEvents({
        companyId: session.companyId,
        eventIds: created.map((e) => e.id),
        origin: getRequestOrigin(req),
        cookieHeader: req.headers.get("cookie"),
      });
    } catch (triggerErr) {
      console.error("Ingest: failed to trigger autonomous run (live internal):", triggerErr);
    }
  }

  return NextResponse.json({
    success: true,
    ingested: created.length,
    events: created,
    tools: toolResults,
  });
}
