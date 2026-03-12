import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isNonRiskNotification } from "@/lib/signal-filters";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import { triggerAutonomousRunForEvents } from "@/server/risk/live-internal-signals";
import {
  fetchGmailMessagesSinceHistory,
  findCompanyIdByGoogleEmailAddress,
  getGooglePushEndpoint,
  isValidGooglePushToken,
  listRecentGmailMessages,
} from "@/server/email/google";

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
  items: { summary: string; raw?: unknown }[],
  model: string,
): Promise<boolean[]> {
  if (items.length === 0) return [];
  if (!process.env.GEMINI_API_KEY) return items.map(() => false);

  const blocks = items.map((item, i) => `[Item ${i + 1}]\n${contentForRiskCheck(item.summary, item.raw) || "(no content)"}`);
  const prompt = `You are a risk analyst. For each item below (email or message summary and content), decide if it could relate to OPERATIONAL, COMPLIANCE, or SECURITY risk, supply chain, vendors, or business disruption. Include: incidents, breaches, complaints, legal/regulatory, outages, fraud, audits, recalls, security alerts, disputes, claims, failures, escalations, supplier/vendor issues, delivery or quality concerns, and any business email that is not clearly only marketing or a shipping receipt. Exclude only: obvious marketing blasts, package-shipped/delivery notifications, welcome emails, and spam. When in doubt, include (risk_relevant: true). Return ONLY valid JSON, no markdown, in this exact shape: {"results":[{"risk_relevant":true},{"risk_relevant":false},...]} with one object per item in the same order.\n\n${blocks.join("\n\n")}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const text = response.text?.trim();
    if (!text) return items.map(() => false);
    const parsed = JSON.parse(text) as { results?: Array<{ risk_relevant?: boolean }> };
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    return items.map((_, i) => Boolean(results[i]?.risk_relevant));
  } catch (err) {
    console.error("Gmail push risk classification error:", err);
    return items.map(() => false);
  }
}

function decodePubsubData(data: string | undefined): Record<string, unknown> | null {
  if (!data) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    ok: true,
    message: "Google Pub/Sub Gmail push endpoint is reachable.",
    endpoint: getGooglePushEndpoint(origin),
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-google-push-token");
  if (!isValidGooglePushToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: { data?: string; messageId?: string; message_id?: string };
    subscription?: string;
  };
  const payload = decodePubsubData(body.message?.data);
  const emailAddress = typeof payload?.emailAddress === "string" ? payload.emailAddress : null;
  const historyId = typeof payload?.historyId === "string" ? payload.historyId : null;
  if (!emailAddress || !historyId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "missing_payload" });
  }

  const companyId = await findCompanyIdByGoogleEmailAddress(emailAddress);
  if (!companyId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_company_for_email" });
  }
  const model = await getGeminiModelForCompany(companyId);

  let messages = await fetchGmailMessagesSinceHistory(companyId, historyId);
  if (messages.length === 0) {
    // History deltas can occasionally be empty on first/lagged push notifications.
    // Fallback to recent inbox fetch so live mode still ingests new mail promptly.
    messages = await listRecentGmailMessages(companyId, 10);
  }
  const candidates = messages;
  const obviousNonRiskFlags = candidates.map(
    (message) =>
      isNonRiskNotification(message.summary) ||
      isNonRiskNotification(textFromRawItem(message.raw).join(" "))
  );
  const toClassify = candidates
    .map((message, index) => ({ message, index }))
    .filter(({ index }) => !obviousNonRiskFlags[index]);
  const classifiedFlags = await classifyRiskRelevance(
    toClassify.map(({ message }) => ({ summary: message.summary, raw: message.raw })),
    model,
  );
  const relevantFlags = candidates.map((_, index) => {
    if (obviousNonRiskFlags[index]) return false;
    const mapped = toClassify.findIndex((entry) => entry.index === index);
    return mapped >= 0 ? Boolean(classifiedFlags[mapped]) : false;
  });
  const relevantMessages = candidates.filter((_, index) => relevantFlags[index]);
  const createdIds: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const message = candidates[i];
    const isRelevant = relevantFlags[i] === true;
    const existing = await db.ingestedEvent.findFirst({
      where: {
        companyId,
        toolName: message.toolName,
        externalId: message.externalId,
      },
      select: { id: true },
    });
    if (existing) continue;

    const event = await db.ingestedEvent.create({
      data: {
        companyId,
        source: message.source,
        toolName: message.toolName,
        externalId: message.externalId,
        rawContent: message.raw as Prisma.InputJsonValue,
        signalSummary: message.summary,
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
        origin: url.origin,
      });
    } catch (err) {
      console.error("Gmail push: failed to trigger autonomous run:", err);
    }
  }
  console.info(
    "[gmail-push] company=%s email=%s history=%s received=%d relevant=%d ingested=%d",
    companyId,
    emailAddress,
    historyId,
    messages.length,
    relevantMessages.length,
    createdIds.length
  );

  return NextResponse.json({
    ok: true,
    companyId,
    received: messages.length,
    riskRelevant: relevantMessages.length,
    ingested: candidates.length,
    queuedForAutonomous: createdIds.length,
  });
}
