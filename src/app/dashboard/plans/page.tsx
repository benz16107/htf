import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MitigationCard } from "@/components/MitigationCard";

export default async function MitigationPlansPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const riskCases = await db.riskCase.findMany({
    where: { companyId: session.companyId },
    include: { scenarios: true, mitigationPlans: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const latestPlanIsExecuted = (rc: { mitigationPlans: { status: string }[] }) =>
    rc.mitigationPlans?.[0]?.status === "EXECUTED";
  const hasDraftOrNone = (rc: { mitigationPlans: { status: string }[] }) =>
    !rc.mitigationPlans?.length || rc.mitigationPlans[0]?.status !== "EXECUTED";

  const withScenarios = riskCases.filter((rc) => rc.scenarios.length > 0);
  const activeCases = withScenarios.filter((rc) => hasDraftOrNone(rc));
  const archivedCases = withScenarios.filter((rc) => latestPlanIsExecuted(rc));

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Mitigation plans" />

      {activeCases.length === 0 ? (
        <section className="card empty-state">
          <h3>No current cases</h3>
          <p>Disruption cases will appear here for approval.</p>
          <Link href="/dashboard/triggered-risk" className="btn primary" style={{ marginTop: "1.5rem" }}>Signals & risk</Link>
        </section>
      ) : (
        <div className="stack-lg">
          <h3 className="text-lg font-semibold" style={{ margin: 0 }}>Current cases</h3>
          <div className="stack-md" style={{ marginTop: "0.75rem" }}>
            {activeCases.map((rc, index) => (
              <MitigationCard key={rc.id} riskCase={rc} defaultExpanded={index === 0} />
            ))}
          </div>
        </div>
      )}

      <div className="stack-lg" style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
        <h3 className="text-lg font-semibold muted" style={{ margin: 0 }}>Archive</h3>
        <div className="stack-md" style={{ marginTop: "0.75rem" }}>
          {archivedCases.length === 0 ? (
            <p className="muted text-sm" style={{ margin: 0 }}>No archived cases yet.</p>
          ) : (
            archivedCases.map((rc) => (
              <MitigationCard key={rc.id} riskCase={rc} archived />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
