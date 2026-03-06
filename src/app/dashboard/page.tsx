import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";

export default async function DashboardHomePage() {
  const session = await getSession();

  let companyName = "Your Company";
  let activeRisks = 0;
  let pendingMitigations = 0;
  let recentTraces: { id: string; stepTitle: string | null; rationale: string | null; createdAt: Date }[] = [];

  if (session?.companyId) {
    const company = await db.company.findUnique({ where: { id: session.companyId }, select: { name: true } });
    if (company) companyName = company.name;

    activeRisks = await db.riskCase.count({
      where: { companyId: session.companyId, mitigationPlans: { none: { status: { in: ["EXECUTED", "REFLECTED"] } } } },
    });

    pendingMitigations = await db.mitigationPlan.count({
      where: { companyId: session.companyId, status: "DRAFTED" },
    });

    recentTraces = await db.reasoningTrace.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, stepTitle: true, rationale: true, createdAt: true },
    });
  }

  return (
    <div className="overview-page stack-xl">
      <AppHeader
        title={companyName}
        subtitle="Supply chain risk and mitigation at a glance. Monitor triggers, review agent activity, and manage mitigations."
      />

      {/* Key metrics */}
      <section className="overview-section">
        <h2 className="overview-section__title">Key metrics</h2>
        <p className="overview-section__desc">Current risk and mitigation status for your operations.</p>
        <div className="overview-metrics">
          <div
            className="overview-metric"
            data-status={activeRisks > 0 ? "attention" : "ok"}
          >
            <span className="overview-metric__label">Active risk cases</span>
            <span className="overview-metric__value" data-status={activeRisks > 0 ? "attention" : "ok"}>
              {activeRisks}
            </span>
            <span className="overview-metric__note">
              {activeRisks > 0 ? "Require assessment or mitigation" : "No open cases"}
            </span>
          </div>
          <div
            className="overview-metric"
            data-status={pendingMitigations > 0 ? "pending" : "neutral"}
          >
            <span className="overview-metric__label">Pending mitigations</span>
            <span className="overview-metric__value" data-status={pendingMitigations > 0 ? "pending" : "neutral"}>
              {pendingMitigations}
            </span>
            <span className="overview-metric__note">
              {pendingMitigations > 0 ? "Drafts awaiting approval" : "No drafts"}
            </span>
          </div>
          <div className="overview-metric" data-status="ok">
            <span className="overview-metric__label">Escalation health</span>
            <span className="overview-metric__value" data-status="ok">100%</span>
            <span className="overview-metric__note">No threshold breaches</span>
          </div>
          <div className="overview-metric overview-metric--mode" data-status="neutral">
            <span className="overview-metric__label">Agent mode</span>
            <span className="overview-metric__value overview-metric__value--text" data-status="neutral">
              Human in loop
            </span>
            <span className="overview-metric__note">Actions require your approval</span>
          </div>
        </div>
      </section>

      <div className="overview-main">
        {/* Recent activity */}
        <section className="card overview-activity">
          <div className="overview-activity__head">
            <div>
              <h3 className="overview-activity__title">Recent activity</h3>
              <p className="muted text-xs" style={{ margin: "0.2rem 0 0" }}>
                Latest reasoning steps from the risk and mitigation agents.
              </p>
            </div>
            <Link href="/dashboard/logs" className="btn secondary btn-sm">
              View all logs
            </Link>
          </div>
          {recentTraces.length === 0 ? (
            <div className="overview-activity__empty">
              <p className="muted text-sm">No activity yet.</p>
              <p className="text-xs muted" style={{ marginTop: "0.25rem" }}>
                Run a risk assessment or trigger an event to see agent traces here.
              </p>
              <Link href="/dashboard/triggered-risk" className="btn primary btn-sm" style={{ marginTop: "0.75rem" }}>
                Go to Signals & Risk/Impact Analysis
              </Link>
            </div>
          ) : (
            <ul className="overview-activity__list">
              {recentTraces.map((trace) => (
                <li key={trace.id} className="overview-activity__item">
                  <div className="overview-activity__item-head">
                    <span className="overview-activity__item-title">
                      {trace.stepTitle || "Step"}
                    </span>
                    <time className="overview-activity__item-time" dateTime={new Date(trace.createdAt).toISOString()}>
                      {new Date(trace.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  {trace.rationale && (
                    <p className="overview-activity__item-rationale">
                      {trace.rationale.length > 180 ? `${trace.rationale.slice(0, 180)}…` : trace.rationale}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* System & actions */}
        <aside className="overview-sidebar">
          <section className="card overview-system">
            <h3 className="overview-system__title">System status</h3>
            <p className="text-xs muted" style={{ margin: "0.2rem 0 0.75rem" }}>
              Core components powering risk detection and mitigation.
            </p>
            <ul className="overview-system__list">
              {["Entity extractor", "Integration connectors", "High-level abstractions", "Memory context"].map((label) => (
                <li key={label} className="overview-system__row">
                  <span>{label}</span>
                  <span className="badge success">Active</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card overview-cta">
            <h3 className="overview-cta__title">Quick actions</h3>
            <p className="text-xs muted" style={{ margin: "0.25rem 0 0.75rem" }}>
              Add signals, run assessments, or open mitigation plans.
            </p>
            <div className="stack-sm">
              <Link href="/dashboard/triggered-risk" className="btn primary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                Signals & Risk/Impact Analysis
              </Link>
              <Link href="/dashboard/plans" className="btn secondary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                Mitigation plans
              </Link>
              <Link href="/dashboard/integrations" className="btn secondary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                Integrations
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
