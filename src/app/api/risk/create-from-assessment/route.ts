import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const { triggerType, entityMap, timeWindow, assumptions, riskAssessment, issueTitle } = body;

    if (!triggerType || !entityMap || !riskAssessment) {
      return NextResponse.json(
        { error: "Missing required fields: triggerType, entityMap, riskAssessment" },
        { status: 400 }
      );
    }

    const out = riskAssessment;
    const tw = timeWindow || {};
    const startDate = tw.startDate || tw.detectionTime || new Date().toISOString().split("T")[0];
    const expectedDurationDays =
      tw.expectedDurationDays ?? (tw.impactWindow === "4_days" ? 4 : 7);

    const severityMap: Record<string, "MINOR" | "MODERATE" | "SEVERE" | "CRITICAL"> = {
      minor: "MINOR",
      moderate: "MODERATE",
      severe: "SEVERE",
      critical: "CRITICAL",
    };
    const recMap: Record<string, "RECOMMENDED" | "FALLBACK" | "ALTERNATE"> = {
      recommended: "RECOMMENDED",
      fallback: "FALLBACK",
      alternate: "ALTERNATE",
    };

    const agentSession = await db.agentSession.create({
      data: {
        companyId: session.companyId,
        agentType: "SIGNAL_RISK",
        status: "COMPLETED",
      },
    });

    const displayTitle =
      typeof issueTitle === "string" && issueTitle.trim()
        ? issueTitle.trim()
        : triggerType;

    const riskCase = await db.riskCase.create({
      data: {
        companyId: session.companyId,
        sessionId: agentSession.id,
        triggerType: displayTitle,
        entityMap: typeof entityMap === "object" ? entityMap : {},
        timeWindow: { startDate, expectedDurationDays },
        evidencePack: typeof entityMap === "object" ? entityMap : {},
        assumptions: Array.isArray(assumptions) ? assumptions : [],
        constraints: {},
        probabilityPoint: out.probability?.pointEstimate ?? undefined,
        probabilityBandLow: out.probability?.bandLow ?? undefined,
        probabilityBandHigh: out.probability?.bandHigh ?? undefined,
        confidenceLevel: out.probability?.confidence ?? undefined,
        keyDrivers: Array.isArray(out.probability?.topDrivers) && out.probability.topDrivers.length > 0
          ? out.probability.topDrivers
          : undefined,
        severity:
          severityMap[String(out.impact?.severity || "moderate").toLowerCase()] ?? "MODERATE",
        serviceImpact: out.impact ?? {},
        financialImpact: out.financialImpact ?? {},
      },
    });

    const normalizePlanOutline = (raw: unknown[]): { task: string; executionType: string }[] =>
      raw.map((t: any) =>
        typeof t === "object" && t != null && "task" in t
          ? { task: String(t.task ?? ""), executionType: String(t.executionType ?? "other") }
          : { task: String(t ?? ""), executionType: "other" }
      );

    for (const s of out.scenarios || []) {
      const rawTasks = Array.isArray(s.plannedTasks) ? s.plannedTasks : (Array.isArray(s.planOutline) ? s.planOutline : []);
      const plannedTasks = normalizePlanOutline(rawTasks);
      const scenarioData = {
        riskCaseId: riskCase.id,
        name: String(s.name || "Scenario"),
        recommendation:
          recMap[String(s.recommendation || "fallback").toLowerCase()] ?? "FALLBACK",
        costDelta: typeof s.costDelta === "number" ? s.costDelta : undefined,
        serviceImpact: typeof s.serviceImpact === "number" ? s.serviceImpact : undefined,
        riskReduction: typeof s.riskReduction === "number" ? s.riskReduction : undefined,
        ...(plannedTasks.length > 0 ? { planOutline: plannedTasks as unknown } : {}),
      };
      try {
        await db.scenario.create({ data: scenarioData });
      } catch (scenarioErr: unknown) {
        const msg = scenarioErr instanceof Error ? scenarioErr.message : String(scenarioErr);
        if (msg.includes("planOutline") && msg.includes("Unknown argument")) {
          const { planOutline: _omit, ...dataWithoutOutline } = scenarioData as typeof scenarioData & { planOutline?: unknown };
          await db.scenario.create({ data: dataWithoutOutline });
        } else {
          throw scenarioErr;
        }
      }
    }

    return NextResponse.json({ success: true, riskCaseId: riskCase.id });
  } catch (err) {
    console.error("create-from-assessment error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create risk case" },
      { status: 500 }
    );
  }
}
