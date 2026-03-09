import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executeMitigationPlan } from "@/server/agents/execute-mitigation-plan";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const autonomousCompanyId = internalSecret && req.headers.get("x-internal-secret") === internalSecret
      ? req.headers.get("x-autonomous-company-id")
      : null;
    const companyId = session?.companyId ?? (autonomousCompanyId || null);
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { planId, actionIndices, actions: actionsOverride } = body as {
      planId?: string;
      actionIndices?: number[];
      actions?: unknown[];
    };

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const result = await executeMitigationPlan({
      companyId,
      planId,
      actionIndices,
      actionsOverride,
      executionSource: autonomousCompanyId ? "autonomous" : "human",
    });

    return NextResponse.json({
      success: true,
      plan: result.plan,
      ...(result.executionResults ? { executionResults: result.executionResults } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof Error && "code" in error ? String((error as { code?: string }).code) : "";
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status: number }).status)
      : 500;
    console.error("Execution error:", message, code || "", error);
    return NextResponse.json(
      { error: message || "Failed to execute plan" },
      { status }
    );
  }
}
