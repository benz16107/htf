import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickObject(obj: unknown, key: string): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function truncate(text: string | null | undefined, max = 160): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

function parseSubjectFromSignalSummary(summary: string): string | null {
  const m = summary.match(/Email:\s*"([^"]+)"/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function cleanEmailMessageText(text: string | null | undefined): string {
  if (!text) return "";
  const withoutTags = text.replace(/<[^>]+>/g, " ");
  const cleaned = withoutTags
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function extractEmailMessage(raw: Record<string, unknown> | null, payload: Record<string, unknown> | null): string {
  const directMessage =
    pickString(raw, ["body", "body_plain", "bodyPlain", "textBody", "plainText", "message", "text", "content"]) ??
    pickString(payload, ["body", "body_plain", "bodyPlain", "textBody", "plainText", "message", "text", "content"]) ??
    pickString(raw, ["snippet", "preview"]) ??
    pickString(payload, ["snippet", "preview"]);
  return cleanEmailMessageText(directMessage);
}

function deriveSubjectAndPreview(signalSummary: string | null, rawContent: unknown): { subject: string; preview: string } {
  const summary = (signalSummary ?? "").trim();
  const raw = rawContent && typeof rawContent === "object" ? (rawContent as Record<string, unknown>) : null;
  const payload = raw ? pickObject(raw, "payload") : null;
  const subject =
    pickString(raw, ["subject", "title"]) ??
    parseSubjectFromSignalSummary(summary) ??
    "Internal signal";
  const preview = extractEmailMessage(raw, payload);
  return {
    subject: truncate(subject, 120) || "Internal signal",
    preview: truncate(preview, 220) || "(No email message captured)",
  };
}

/**
 * GET /api/risk/events
 * Returns the company's ingested events (from Zapier input-context tools) for the Signals & Risk/Impact Analysis page.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate. Then restart the dev server (stop and run npm run dev again)." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    const events = await (db as unknown as { ingestedEvent: { findMany: (args: object) => Promise<Array<{ id: string; source: string; toolName: string; signalSummary: string | null; rawContent: unknown; createdAt: Date }>> } }).ingestedEvent.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        toolName: true,
        signalSummary: true,
        rawContent: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      events: events.map((e) => {
        const display = deriveSubjectAndPreview(e.signalSummary, e.rawContent);
        return {
        id: e.id,
        source: e.source,
        toolName: e.toolName,
        signal: e.signalSummary || "(no summary)",
        subject: display.subject,
        preview: display.preview,
        time: e.createdAt,
      };
      }),
    });
  } catch (err) {
    console.error("GET /api/risk/events error:", err);
    return NextResponse.json(
      { error: "Could not load events. Run `npx prisma generate` if you recently added the IngestedEvent table." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/risk/events
 * Deletes all ingested events for the current company.
 */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate and restart the dev server." },
        { status: 503 }
      );
    }

    await (db as unknown as { ingestedEvent: { deleteMany: (args: { where: { companyId: string } }) => Promise<unknown> } }).ingestedEvent.deleteMany({
      where: { companyId: session.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/events error:", err);
    return NextResponse.json({ error: "Failed to delete events" }, { status: 500 });
  }
}
