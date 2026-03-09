import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import MitigationPlansClient from "./MitigationPlansClient";

export const dynamic = "force-dynamic";

export default async function MitigationPlansPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const riskCases = await db.riskCase.findMany({
    where: { companyId: session.companyId },
    include: { scenarios: true, mitigationPlans: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const latestPlanIds = riskCases
    .map((rc) => rc.mitigationPlans?.[0]?.id)
    .filter((id): id is string => typeof id === "string");

  const deferredRows = latestPlanIds.length > 0
    ? await db.autonomousAgentLog.findMany({
        where: {
          companyId: session.companyId,
          actionType: "plan_execution_deferred",
          planId: { in: latestPlanIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          planId: true,
          summary: true,
          details: true,
          createdAt: true,
        },
      })
    : [];

  const deferredByPlan = new Map<string, { summary: string | null; details: unknown; createdAt: Date }>();
  for (const row of deferredRows) {
    if (!row.planId || deferredByPlan.has(row.planId)) continue;
    deferredByPlan.set(row.planId, {
      summary: row.summary,
      details: row.details,
      createdAt: row.createdAt,
    });
  }

  const riskCasesWithExecutionContext = riskCases.map((rc) => ({
    ...rc,
    mitigationPlans: rc.mitigationPlans.map((plan) => ({
      ...plan,
      autonomousExecutionDeferred: deferredByPlan.get(plan.id) ?? null,
    })),
  }));

  const latestPlanIsExecuted = (rc: { mitigationPlans: { status: string }[] }) =>
    rc.mitigationPlans?.[0]?.status === "EXECUTED";
  const hasDraftOrNone = (rc: { mitigationPlans: { status: string }[] }) =>
    !rc.mitigationPlans?.length || rc.mitigationPlans[0]?.status !== "EXECUTED";

  const withScenarios = riskCasesWithExecutionContext.filter((rc) => rc.scenarios.length > 0);
  const activeCases = withScenarios.filter((rc) => hasDraftOrNone(rc));
  const archivedCases = withScenarios.filter((rc) => latestPlanIsExecuted(rc));

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Mitigation plans" />
      <MitigationPlansClient activeCases={activeCases} archivedCases={archivedCases} />
    </div>
  );
}
