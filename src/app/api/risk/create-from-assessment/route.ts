import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createRiskCaseFromAssessment } from "@/server/risk/create-from-assessment";

/**
 * POST /api/risk/create-from-assessment
 * Creates a RiskCase and Scenarios from a previously run assessment (so user can send an output to mitigation).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { triggerType, entityMap, riskAssessment } = body;

    if (!triggerType || !entityMap || !riskAssessment) {
      return NextResponse.json(
        { error: "Missing required fields: triggerType, entityMap, riskAssessment" },
        { status: 400 }
      );
    }

    const { riskCaseId } = await createRiskCaseFromAssessment(session.companyId, body);
    return NextResponse.json({ success: true, riskCaseId });
  } catch (err) {
    console.error("create-from-assessment error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create risk case" },
      { status: 500 }
    );
  }
}
