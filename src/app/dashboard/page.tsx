import { AppHeader } from "@/components/AppHeader";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { AnimeStagger } from "@/components/AnimeStagger";
import { StatusBanner } from "@/components/StatusBanner";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import { OverviewActivityHead } from "./OverviewActivityHead";
import { OverviewAutonomousToggle } from "./OverviewAutonomousToggle";
import { OverviewModelQuickSelect } from "./OverviewModelQuickSelect";
import { OverviewReceivedSignals } from "./OverviewReceivedSignals";
import { OverviewSupplyChainStatus } from "./OverviewSupplyChainStatus";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await getSession();
  const { saved } = await searchParams;

  let companyName = "Your Company";
  let pendingMitigations = 0;
  let activeRiskCases = 0;
  let automationLevel = "off";
  let geminiModel = await getGeminiModelForCompany(session?.companyId);
  let signalSources: "internal_only" | "external_only" | "both" = "both";
  let lastRun: {
    runId: string;
    processed: number;
    created: number;
    executed: number;
    at: Date;
    internalCandidates?: number;
    externalCandidates?: number;
    skipReasonsCount?: number;
    summary?: string | null;
  } | null = null;

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
      select: { automationLevel: true, signalSources: true },
    });
    if (config?.automationLevel) automationLevel = config.automationLevel;
    if (config?.signalSources === "internal_only" || config?.signalSources === "external_only") {
      signalSources = config.signalSources;
    }

    try {
      const completed = await db.autonomousAgentLog.findFirst({
        where: { companyId: session.companyId, actionType: "run_completed" },
        orderBy: { createdAt: "desc" },
        select: { runId: true, details: true, summary: true, createdAt: true },
      });
      if (completed?.details && typeof completed.details === "object") {
        const d = completed.details as {
          processed?: number;
          created?: number;
          executed?: number;
          internalCandidates?: number;
          externalCandidates?: number;
          skipReasonsCount?: number;
        };
        lastRun = {
          runId: completed.runId,
          processed: Number(d.processed ?? 0),
          created: Number(d.created ?? 0),
          executed: Number(d.executed ?? 0),
          at: completed.createdAt,
          internalCandidates: typeof d.internalCandidates === "number" ? d.internalCandidates : undefined,
          externalCandidates: typeof d.externalCandidates === "number" ? d.externalCandidates : undefined,
          skipReasonsCount: typeof d.skipReasonsCount === "number" ? d.skipReasonsCount : undefined,
          summary: completed.summary ?? undefined,
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
      {saved === "baselayer" ? (
        <StatusBanner
          variant="success"
          title="Base profile saved"
          message="Changes saved."
        />
      ) : null}
      {saved === "integrations" ? (
        <StatusBanner
          variant="success"
          title="Integrations saved"
          message="Changes saved."
        />
      ) : null}
      {saved === "high-level" ? (
        <StatusBanner
          variant="success"
          title="High-level profile saved"
          message="Changes saved."
        />
      ) : null}

      <AnimeStagger className="overview-metrics">
        <Link
          href="/dashboard/plans"
          className="overview-metric"
          data-status={activeRiskCases > 0 ? "attention" : "ok"}
          data-animate-item
        >
          <span className="overview-metric__label">Active risk cases</span>
          <span className="overview-metric__value" data-status={activeRiskCases > 0 ? "attention" : "ok"}>
            <AnimatedCounter value={activeRiskCases} />
          </span>
          <span className="overview-metric__note">{activeRiskCases > 0 ? "Open" : "None"}</span>
        </Link>
        <Link
          href="/dashboard/plans"
          className="overview-metric"
          data-status={pendingMitigations > 0 ? "pending" : "neutral"}
          data-animate-item
        >
          <span className="overview-metric__label">Pending approvals</span>
          <span className="overview-metric__value" data-status={pendingMitigations > 0 ? "pending" : "neutral"}>
            <AnimatedCounter value={pendingMitigations} />
          </span>
          <span className="overview-metric__note">{pendingMitigations > 0 ? "Awaiting approval" : "No drafts"}</span>
        </Link>
        <Link
          href="/dashboard/triggered-risk"
          className="overview-metric"
          data-status="neutral"
          data-animate-item
        >
          <span className="overview-metric__label">Signals &amp; risk</span>
          <span className="overview-metric__value overview-metric__value--text" data-status="neutral">
            View
          </span>
          <span className="overview-metric__note">Signals &amp; impact</span>
        </Link>
        <div data-animate-item>
          <OverviewAutonomousToggle initialLevel={automationLevel} />
        </div>
      </AnimeStagger>

      <AnimeStagger className="overview-main" itemSelector="[data-animate-panel]" delayStep={110}>
        <section className="card overview-activity" data-animate-panel>
          <OverviewActivityHead />
          {lastRun ? (
            <div className="overview-activity__run overview-activity__run-content">
              <p className="text-sm" style={{ margin: 0 }}>
                <strong>{lastRun.processed}</strong> processed · <strong>{lastRun.created}</strong> risk cases created · <strong>{lastRun.executed}</strong> plans executed
              </p>
              <p className="text-xs muted" style={{ margin: "0.35rem 0 0 0" }}>
                {formatRunTime(lastRun.at)}
              </p>
              <Link href="/dashboard/logs" className="btn secondary btn-sm overview-activity__run-link">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  visibility
                </span>
                View run
              </Link>
            </div>
          ) : (
            <div className="overview-activity__empty stack-sm">
              <p className="muted text-sm">No runs.</p>
              <Link href="/dashboard/logs" className="btn primary btn-sm">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  smart_toy
                </span>
                Autonomous agent
              </Link>
            </div>
          )}
        </section>

        <aside className="overview-sidebar" data-animate-panel>
          <section className="card overview-cta">
            <h3 className="overview-cta__title" style={{ margin: 0 }}>Quick actions</h3>
            <div className="stack-sm overview-cta__actions">
              <OverviewModelQuickSelect initialGeminiModel={geminiModel} />
              <Link href="/dashboard/triggered-risk" className="btn primary btn-sm block">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  warning
                </span>
                Signals &amp; risk
              </Link>
              <Link href="/dashboard/plans" className="btn secondary btn-sm block">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  task_alt
                </span>
                Mitigation plans
              </Link>
              <Link href="/dashboard/logs" className="btn secondary btn-sm block">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  smart_toy
                </span>
                Autonomous agent
              </Link>
            </div>
          </section>
        </aside>
      </AnimeStagger>

      <div>
        <OverviewSupplyChainStatus />
      </div>

      <div>
        <OverviewReceivedSignals signalSources={signalSources} />
      </div>
    </div>
  );
}
