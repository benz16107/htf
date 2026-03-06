import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/mitigation-plans/clone
 * Body: { sourcePlanId: string }
 * Creates a new DRAFTED mitigation plan from an existing (usually EXECUTED) plan.
 * Same risk case and scenario; actions are copied so the user can re-run or edit.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const sourcePlanId = body?.sourcePlanId;
    if (!sourcePlanId || typeof sourcePlanId !== "string") {
      return NextResponse.json({ error: "Missing sourcePlanId" }, { status: 400 });
    }

    const source = await db.mitigationPlan.findFirst({
      where: { id: sourcePlanId, companyId: session.companyId },
    });

    if (!source) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const newPlan = await db.mitigationPlan.create({
      data: {
        companyId: session.companyId,
        riskCaseId: source.riskCaseId,
        scenarioId: source.scenarioId,
        status: "DRAFTED",
        executionMode: source.executionMode,
        actions: source.actions,
      },
    });

    return NextResponse.json({ success: true, plan: newPlan });
  } catch (err) {
    console.error("POST /api/mitigation-plans/clone error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clone plan" },
      { status: 500 }
    );
  }
}
