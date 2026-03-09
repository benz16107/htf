import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNonRiskNotification } from "@/lib/signal-filters";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  buildInboundSignalSummary,
  extractLiveInboundItems,
  getInboundExternalId,
  getInboundSource,
  getInboundToolName,
  isValidLiveIngestToken,
  triggerAutonomousRunForEvents,
} from "@/server/risk/live-internal-signals";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function textFromRawItem(raw: unknown): string[] {
  const out: string[] = [];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["subject", "snippet", "body", "title", "content", "message", "textBody", "plainText", "bodyPlain"]) {
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

function contentForRiskCheck(summary: string, raw?: unknown): string {
  return [summary, ...textFromRawItem(raw)].join(" ").trim().slice(0, 1200);
}

async function classifyRiskRelevance(
  items: { summary: string; raw?: unknown }[]
): Promise<boolean[]> {
  if (items.length === 0) return [];
  if (!process.env.GEMINI_API_KEY) return items.map(() => false);

  const blocks = items.map((item, i) => `[Item ${i + 1}]\n${contentForRiskCheck(item.summary, item.raw) || "(no content)"}`);
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
    console.error("Live ingest risk classification error:", err);
    return items.map(() => false);
  }
}

async function parseRequestPayload(request: Request): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData().catch(() => null);
    if (!form) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") continue;
      if (key in out) {
        const current = out[key];
        out[key] = Array.isArray(current) ? [...current, value] : [current, value];
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  const rawText = await request.text().catch(() => "");
  if (!rawText.trim()) return {};
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return { body: rawText };
  }
}

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, value] = auth.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value.trim() : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json({
    ok: true,
    message: "Live ingest endpoint is reachable. Send a POST request with an email payload.",
    companyId: url.searchParams.get("companyId"),
    expects: "POST",
    accepts: ["application/json", "application/x-www-form-urlencoded", "multipart/form-data", "text/plain"],
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
    },
  });
}

/**
 * POST /api/risk/ingest/live
 * Receives inbound signals directly from Zapier/webhooks so new email can appear as a live internal signal.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const body = await parseRequestPayload(request);
  const url = new URL(request.url);

  const companyId =
    session?.companyId ||
    (typeof body.companyId === "string" ? body.companyId : null) ||
    url.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const providedToken =
    request.headers.get("x-live-ingest-token") ||
    getBearerToken(request) ||
    (typeof body.token === "string" ? body.token : null) ||
    url.searchParams.get("token");

  const authorized = session?.companyId === companyId || isValidLiveIngestToken(companyId, providedToken);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = extractLiveInboundItems(body);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No inbound events found. Send an email object or an events/emails/items array." },
      { status: 400 }
    );
  }

  const source = getInboundSource(body);
  const toolName = getInboundToolName(body);
  const createdIds: string[] = [];
  const candidates = items
    .slice(0, 25)
    .map((item) => ({
      item,
      summary: buildInboundSignalSummary(item, source),
    }));
  const obviousNonRiskFlags = candidates.map(
    ({ summary, item }) =>
      isNonRiskNotification(summary) || isNonRiskNotification(textFromRawItem(item).join(" "))
  );
  const toClassify = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ index }) => !obviousNonRiskFlags[index]);
  const classifiedFlags = await classifyRiskRelevance(
    toClassify.map(({ candidate }) => ({ summary: candidate.summary, raw: candidate.item }))
  );
  const relevantFlags = candidates.map((_, index) => {
    if (obviousNonRiskFlags[index]) return false;
    const mapped = toClassify.findIndex((entry) => entry.index === index);
    return mapped >= 0 ? Boolean(classifiedFlags[mapped]) : false;
  });
  const relevantItems = candidates.filter((_, index) => relevantFlags[index]);

  for (let i = 0; i < candidates.length; i++) {
    const { item, summary } = candidates[i];
    const isRelevant = relevantFlags[i] === true;
    const externalId = getInboundExternalId(item);
    if (externalId) {
      const existing = await db.ingestedEvent.findFirst({
        where: { companyId, toolName, externalId },
        select: { id: true },
      });
      if (existing) continue;
    }

    const event = await db.ingestedEvent.create({
      data: {
        companyId,
        source,
        toolName,
        externalId: externalId ?? undefined,
        rawContent: item as Prisma.InputJsonValue,
        signalSummary: summary,
        ...(isRelevant ? {} : { autonomousProcessedAt: new Date() }),
      },
      select: { id: true },
    });
    if (isRelevant) createdIds.push(event.id);
  }

  if (createdIds.length > 0) {
    try {
      await triggerAutonomousRunForEvents({
        companyId,
        eventIds: createdIds,
        origin: getRequestOrigin(request),
        cookieHeader: request.headers.get("cookie"),
      });
    } catch (err) {
      console.error("Live ingest: failed to trigger autonomous run:", err);
    }
  }

  return NextResponse.json({
    success: true,
    received: items.length,
    riskRelevant: relevantItems.length,
    ingested: candidates.length,
    eventIds: createdIds,
  });
}
