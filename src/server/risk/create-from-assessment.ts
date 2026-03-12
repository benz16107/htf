import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type CreateFromAssessmentBody = {
  triggerType: string;
  entityMap: Record<string, unknown>;
  timeWindow?: {
    startDate?: string;
    detectionTime?: string;
    expectedDurationDays?: number;
    impactWindow?: string;
  };
  assumptions?: unknown[];
  riskAssessment: {
    probability?: { pointEstimate?: number; bandLow?: number; bandHigh?: number; confidence?: string; topDrivers?: string[] };
    impact?: { severity?: string; timelineWeeks?: number; affectedAreas?: string[] };
    financialImpact?: { revenueAtRiskUsd?: number; hardCostIncreaseUsd?: number; marginErosionPercent?: number };
    scenarios?: Array<{
      name?: string;
      recommendation?: string;
      costDelta?: number;
      serviceImpact?: number;
      riskReduction?: number;
      plannedTasks?: unknown[];
      planOutline?: unknown[];
    }>;
  };
  issueTitle?: string;
};

export type CreateFromAssessmentOptions = {
  autonomous?: boolean;
};

/**
 * Creates a RiskCase and Scenarios from a risk assessment output. Used by API and autonomous runner.
 */
export async function createRiskCaseFromAssessment(
  companyId: string,
  body: CreateFromAssessmentBody,
  options?: CreateFromAssessmentOptions
): Promise<{ riskCaseId: string }> {
  const { triggerType, entityMap, timeWindow, assumptions, riskAssessment, issueTitle } = body;

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
      companyId,
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
      companyId,
      sessionId: agentSession.id,
      triggerType: displayTitle,
      createdByAutonomousAgent: options?.autonomous ?? false,
      entityMap: (typeof entityMap === "object" ? entityMap : {}) as Prisma.InputJsonValue,
      timeWindow: { startDate, expectedDurationDays },
      evidencePack: (typeof entityMap === "object" ? entityMap : {}) as Prisma.InputJsonValue,
      assumptions: (Array.isArray(assumptions) ? assumptions : []) as Prisma.InputJsonValue,
      constraints: {} as Prisma.InputJsonValue,
      probabilityPoint: out.probability?.pointEstimate ?? undefined,
      probabilityBandLow: out.probability?.bandLow ?? undefined,
      probabilityBandHigh: out.probability?.bandHigh ?? undefined,
      confidenceLevel: out.probability?.confidence ?? undefined,
      keyDrivers: Array.isArray(out.probability?.topDrivers) && out.probability.topDrivers.length > 0
        ? out.probability.topDrivers
        : undefined,
      severity:
        severityMap[String(out.impact?.severity || "moderate").toLowerCase()] ?? "MODERATE",
      serviceImpact: (out.impact ?? {}) as Prisma.InputJsonValue,
      financialImpact: (out.financialImpact ?? {}) as Prisma.InputJsonValue,
    },
  });

  const normalizePlanOutline = (raw: unknown[]): { task: string; executionType: string }[] =>
    raw.map((t: unknown) =>
      typeof t === "object" && t != null && "task" in t
        ? { task: String((t as { task?: unknown }).task ?? ""), executionType: String((t as { executionType?: unknown }).executionType ?? "other") }
        : { task: String(t ?? ""), executionType: "other" }
    );

  function normalizeScenarioMetrics(s: { costDelta?: number; serviceImpact?: number; riskReduction?: number }) {
    const cd = Number(s.costDelta);
    const si = Number(s.serviceImpact);
    const rr = Number(s.riskReduction);
    return {
      costDelta: Number.isFinite(cd) ? (cd > 2 ? 1 + Math.min(500, cd) / 100 : Math.max(0.01, Math.min(10, cd))) : undefined,
      serviceImpact: Number.isFinite(si) ? (si > 1 ? Math.min(1, si / 100) : Math.max(0, Math.min(1, si))) : undefined,
      riskReduction: Number.isFinite(rr) ? (rr > 1 ? Math.min(1, rr / 100) : Math.max(0, Math.min(1, rr))) : undefined,
    };
  }

  for (const s of out.scenarios || []) {
    const rawTasks = Array.isArray(s.plannedTasks) ? s.plannedTasks : (Array.isArray(s.planOutline) ? s.planOutline : []);
    const plannedTasks = normalizePlanOutline(rawTasks);
    const metrics = normalizeScenarioMetrics({
      costDelta: typeof s.costDelta === "number" ? s.costDelta : undefined,
      serviceImpact: typeof s.serviceImpact === "number" ? s.serviceImpact : undefined,
      riskReduction: typeof s.riskReduction === "number" ? s.riskReduction : undefined,
    });
    const scenarioData = {
      riskCaseId: riskCase.id,
      name: String(s.name || "Scenario"),
      recommendation:
        recMap[String(s.recommendation || "fallback").toLowerCase()] ?? "FALLBACK",
      ...metrics,
      ...(plannedTasks.length > 0 ? { planOutline: plannedTasks as Prisma.InputJsonValue } : {}),
    };
    try {
      await db.scenario.create({ data: scenarioData });
    } catch (scenarioErr: unknown) {
      const msg = scenarioErr instanceof Error ? scenarioErr.message : String(scenarioErr);
      if (msg.includes("planOutline") && msg.includes("Unknown argument")) {
        const dataWithoutOutline = { ...scenarioData } as typeof scenarioData & { planOutline?: unknown };
        delete dataWithoutOutline.planOutline;
        await db.scenario.create({ data: dataWithoutOutline });
      } else {
        throw scenarioErr;
      }
    }
  }

  return { riskCaseId: riskCase.id };
}
