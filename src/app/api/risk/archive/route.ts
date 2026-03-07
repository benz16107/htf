import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/risk/archive — returns archived assessments (sent to mitigation) for the company. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db.assessmentArchive.findMany({
      where: { companyId: session.companyId },
      orderBy: { sentAt: "desc" },
      take: 200,
    });

    const archived = rows.map((r) => ({
      id: r.id,
      triggerType: r.triggerType,
      issueTitle: r.issueTitle ?? undefined,
      entityMap: (r.entityMap as Record<string, string>) ?? {},
      timeWindow: (r.timeWindow as { startDate?: string; expectedDurationDays?: number }) ?? {},
      assumptions: (Array.isArray(r.assumptions) ? r.assumptions : []) as string[],
      assessment: (r.assessment as object) ?? {},
      sentAt: r.sentAt.toISOString(),
      source: r.source,
    }));

    return NextResponse.json({ archived });
  } catch (err) {
    console.error("GET /api/risk/archive error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load archive" },
      { status: 500 }
    );
  }
}

/** POST /api/risk/archive — add an assessment to the archive (e.g. when user sends to mitigation from Signals page). */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const triggerType = typeof body.triggerType === "string" ? body.triggerType : "";
    const issueTitle = typeof body.issueTitle === "string" ? body.issueTitle : null;
    const entityMap = body.entityMap && typeof body.entityMap === "object" ? body.entityMap : {};
    const timeWindow = body.timeWindow && typeof body.timeWindow === "object" ? body.timeWindow : {};
    const assumptions = Array.isArray(body.assumptions) ? body.assumptions : [];
    const assessment = body.assessment && typeof body.assessment === "object" ? body.assessment : {};

    if (!triggerType.trim()) {
      return NextResponse.json({ error: "triggerType required" }, { status: 400 });
    }

    const row = await db.assessmentArchive.create({
      data: {
        companyId: session.companyId,
        triggerType: triggerType.trim(),
        issueTitle: issueTitle?.trim() || null,
        entityMap,
        timeWindow,
        assumptions,
        assessment,
        source: "manual",
      },
    });

    return NextResponse.json({
      id: row.id,
      sentAt: row.sentAt.toISOString(),
    });
  } catch (err) {
    console.error("POST /api/risk/archive error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add to archive" },
      { status: 500 }
    );
  }
}

/** DELETE /api/risk/archive — delete all archived assessments for the company. */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db.assessmentArchive.deleteMany({
      where: { companyId: session.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/archive error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear archive" },
      { status: 500 }
    );
  }
}
