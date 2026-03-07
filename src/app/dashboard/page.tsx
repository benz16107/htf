import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";
import { OverviewActivityHead } from "./OverviewActivityHead";
import { OverviewAutonomousToggle } from "./OverviewAutonomousToggle";

export default async function DashboardHomePage() {
  const session = await getSession();

  let companyName = "Your Company";
  let pendingMitigations = 0;
  let activeRiskCases = 0;
  let automationLevel = "off";
  let lastRun: { processed: number; created: number; executed: number; at: Date } | null = null;

  if (session?.companyId) {
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    });
    if (company) companyName = company.name;

    [pendingMitigations, activeRiskCases] = await Promise.all([
      db.mitigationPlan.count({
        where: { companyId: session.companyId, status: "DRAFTED" },
      }),
      db.riskCase.count({
        where: {
          companyId: session.companyId,
          mitigationPlans: { none: { status: { in: ["EXECUTED", "REFLECTED"] } } },
        },
      }),
    ]);

    const config = await db.autonomousAgentConfig.findUnique({
      where: { companyId: session.companyId },
      select: { automationLevel: true },
    });
    if (config?.automationLevel) automationLevel = config.automationLevel;

    try {
      const completed = await db.autonomousAgentLog.findFirst({
        where: { companyId: session.companyId, actionType: "run_completed" },
        orderBy: { createdAt: "desc" },
        select: { details: true, createdAt: true },
      });
      if (completed?.details && typeof completed.details === "object") {
        const d = completed.details as { processed?: number; created?: number; executed?: number };
        lastRun = {
          processed: Number(d.processed ?? 0),
          created: Number(d.created ?? 0),
          executed: Number(d.executed ?? 0),
          at: completed.createdAt,
        };
      }
    } catch {
      // autonomousAgentLog may be missing if Prisma client is stale
    }
  }

  function formatRunTime(iso: Date): string {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  return (
    <div className="overview-page stack-xl">
      <AppHeader title={companyName} />

      <div className="overview-metrics">
        <Link
          href="/dashboard/plans"
          className="overview-metric"
          data-status={activeRiskCases > 0 ? "attention" : "ok"}
        >
          <span className="overview-metric__label">Active risk cases</span>
          <span className="overview-metric__value" data-status={activeRiskCases > 0 ? "attention" : "ok"}>
            {activeRiskCases}
          </span>
          <span className="overview-metric__note">{activeRiskCases > 0 ? "Open" : "None"}</span>
        </Link>
        <Link
          href="/dashboard/plans"
          className="overview-metric"
          data-status={pendingMitigations > 0 ? "pending" : "neutral"}
        >
          <span className="overview-metric__label">Pending approvals</span>
          <span className="overview-metric__value" data-status={pendingMitigations > 0 ? "pending" : "neutral"}>
            {pendingMitigations}
          </span>
          <span className="overview-metric__note">{pendingMitigations > 0 ? "Awaiting approval" : "No drafts"}</span>
        </Link>
        <Link
          href="/dashboard/triggered-risk"
          className="overview-metric"
          data-status="neutral"
        >
          <span className="overview-metric__label">Signals &amp; risk</span>
          <span className="overview-metric__value overview-metric__value--text" data-status="neutral">
            View
          </span>
          <span className="overview-metric__note">Signals &amp; impact</span>
        </Link>
        <OverviewAutonomousToggle initialLevel={automationLevel} />
      </div>

      <div className="overview-main">
        <section className="card overview-activity">
          <OverviewActivityHead />
          {lastRun ? (
            <div className="overview-activity__run" style={{ padding: "1.25rem" }}>
              <p className="text-sm" style={{ margin: 0 }}>
                <strong>{lastRun.processed}</strong> processed · <strong>{lastRun.created}</strong> risk cases created · <strong>{lastRun.executed}</strong> plans executed
              </p>
              <p className="text-xs muted" style={{ margin: "0.35rem 0 0 0" }}>
                {formatRunTime(lastRun.at)}
              </p>
            </div>
          ) : (
            <div className="overview-activity__empty stack-sm">
              <p className="muted text-sm">No runs yet.</p>
              <Link href="/dashboard/logs" className="btn primary btn-sm">Autonomous agent</Link>
            </div>
          )}
        </section>

        <aside className="overview-sidebar">
          <section className="card overview-cta">
            <h3 className="overview-cta__title" style={{ margin: 0 }}>Quick actions</h3>
            <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
              <Link href="/dashboard/triggered-risk" className="btn primary btn-sm block">
                Signals &amp; risk
              </Link>
              <Link href="/dashboard/plans" className="btn secondary btn-sm block">
                Mitigation plans
              </Link>
              <Link href="/dashboard/logs" className="btn secondary btn-sm block">
                Autonomous agent
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
