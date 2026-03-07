import { AppHeader } from "@/components/AppHeader";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PostAnalysisClient } from "@/components/PostAnalysisClient";
import { BackboardClient } from "@/server/memory/backboard-client";

export const dynamic = "force-dynamic";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function formatUsd(n: unknown): string {
  const num = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(num)) return "Unknown";
  return `$${Math.round(num).toLocaleString()}`;
}

export default async function PostAnalysisPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  let memoryThreads = await db.memoryThread.findMany({
    where: { companyId: session.companyId },
    select: { id: true },
  });

  // Create Backboard thread on first visit if configured (so "Connected" shows without running agent first)
  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  if (memoryThreads.length === 0 && backboard.isConfigured()) {
    try {
      const created = await backboard.createThread({
        agentName: "SignalRisk",
        companyId: session.companyId,
        accessScope: "company_all",
      });
      await db.memoryThread.create({
        data: {
          companyId: session.companyId,
          agentType: "SIGNAL_RISK",
          accessScope: "COMPANY_ALL",
          backboardAssistantId: created.assistantId,
          backboardThreadId: created.threadId,
        },
      });
      memoryThreads = [{ id: "created" }];
    } catch (_) {
      // leave memoryThreads empty so we show "Not linked"
    }
  }

  const [setupComplete, executedCount, unresolvedExecutions, playbooks] = await Promise.all([
    hasCompletedSetup(),
    db.mitigationPlan.count({
      where: { companyId: session.companyId, status: "EXECUTED" },
    }),
    db.mitigationPlan.findMany({
      where: { companyId: session.companyId, status: "EXECUTED" },
      include: { riskCase: { include: { scenarios: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.playbookEntry.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Memory" />

      {/* Overview: company status and execution summary */}
      <section className="card stack">
        <h2 className="text-lg font-semibold" style={{ margin: 0 }}>Overview</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Status of your company context and how memory is used across executions.
        </p>
        <div className="grid three" style={{ marginTop: "1rem", gap: "1rem" }}>
          <div className="card-flat stack-xs" style={{ padding: "1rem" }}>
            <span className="text-xs uppercase muted">Setup</span>
            <span className="font-medium">{setupComplete ? "Complete" : "Incomplete"}</span>
            {!setupComplete && (
              <Link href="/setup/baselayer" className="btn secondary btn-sm" style={{ marginTop: "0.25rem" }}>Complete setup</Link>
            )}
          </div>
          <div className="card-flat stack-xs" style={{ padding: "1rem" }}>
            <span className="text-xs uppercase muted">Backboard</span>
            <span className="font-medium">{memoryThreads.length > 0 ? "Connected" : "Not linked"}</span>
            <span className="text-xs muted">
              {memoryThreads.length > 0
                ? "Agent reasoning is stored in Backboard for this company."
                : "Memory thread is created when the agent runs."}
            </span>
          </div>
          <div className="card-flat stack-xs" style={{ padding: "1rem" }}>
            <span className="text-xs uppercase muted">Executions</span>
            <span className="font-medium">{executedCount} executed</span>
            <span className="text-xs muted">{playbooks.length} learnings · {unresolvedExecutions.length} awaiting reflection</span>
          </div>
        </div>
      </section>

      {/* Memory from past executions */}
      <section className="card stack">
        <h2 className="text-lg font-semibold" style={{ margin: 0 }}>Memory from past executions</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Reflections and learnings from executed plans. Used to improve future assessments.
        </p>

        <div className="stack-lg" style={{ marginTop: "1.25rem" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ margin: 0 }}>Awaiting reflection</h3>
            <p className="text-xs muted" style={{ margin: "0.25rem 0 0 0" }}>Record real-world outcomes to add learnings to Memory.</p>
            {unresolvedExecutions.length === 0 ? (
              <div className="card empty-state border-dashed" style={{ marginTop: "0.75rem", background: "transparent" }}>
                <p className="muted">No pending reflections.</p>
              </div>
            ) : (
              <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
                {unresolvedExecutions.map((plan) => (
                  <PostAnalysisClient key={plan.id} plan={plan} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold" style={{ margin: 0 }}>Incident learnings</h3>
            <p className="text-xs muted" style={{ margin: "0.25rem 0 0 0" }}>Stored learnings from completed reflections.</p>
            {playbooks.length === 0 ? (
              <div className="card empty-state border-dashed" style={{ marginTop: "0.75rem", background: "transparent" }}>
                <p className="muted">Complete reflections above to build incident intelligence.</p>
              </div>
            ) : (
              <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
                {playbooks.map((pb) => {
                  const eff = asRecord(pb.effectiveness);
                  const verdict = String(eff?.verdict ?? "unknown");
                  const scoreRaw = eff?.score;
                  const score = typeof scoreRaw === "number" ? scoreRaw : typeof scoreRaw === "string" ? Number(scoreRaw) : 0;
                  const borderColor =
                    verdict === "success" ? "var(--success)" : verdict === "failure" ? "var(--danger)" : "var(--accent)";
                  const predicted = asRecord(pb.predictedOutcome);
                  const actual = asRecord(pb.actualOutcome);
                  const learnings = asStringArray(pb.learnings);

                  return (
                    <div key={pb.id} className="card stack" style={{ borderLeft: `3px solid ${borderColor}`, padding: "1rem" }}>
                      <div className="row between">
                        <h4 className="text-sm font-semibold" style={{ margin: 0, textTransform: "capitalize" }}>
                          {(pb.incidentClass || "Unknown").replace(/_/g, " ")}
                        </h4>
                        <span className="badge">{(Math.max(0, Math.min(1, score)) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="grid two" style={{ gap: "0.75rem" }}>
                        <div className="card-flat" style={{ padding: "0.5rem" }}>
                          <p className="text-xs uppercase muted" style={{ margin: 0 }}>Predicted</p>
                          <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>Cost: {formatUsd(predicted?.cost)}</p>
                        </div>
                        <div className="card-flat" style={{ padding: "0.5rem" }}>
                          <p className="text-xs uppercase muted" style={{ margin: 0 }}>Actual</p>
                          <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>Cost: {formatUsd(actual?.cost)}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase muted" style={{ marginBottom: "0.3rem" }}>Learnings</p>
                        {learnings.length === 0 ? (
                          <p className="muted text-sm" style={{ margin: 0 }}>No learnings recorded.</p>
                        ) : (
                          <ul className="list-disc text-sm" style={{ margin: 0, paddingLeft: "1.25rem" }}>
                            {learnings.map((l, i) => (
                              <li key={i} style={{ marginBottom: "0.15rem" }}>{l}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
