import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PostAnalysisClient } from "@/components/PostAnalysisClient";

export default async function PostAnalysisPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const unresolvedExecutions = await db.mitigationPlan.findMany({
    where: { companyId: session.companyId, status: "EXECUTED" },
    include: { riskCase: { include: { scenarios: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const playbooks = await db.playbookEntry.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Post Analysis" subtitle="Prediction-vs-outcome reflection and playbook updates." />

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="stack-lg">
          <h3>Awaiting Reflection</h3>
          <p className="muted text-sm">Record real-world outcomes for executed plans to improve future models.</p>

          {unresolvedExecutions.length === 0 ? (
            <div className="card empty-state border-dashed" style={{ background: "transparent" }}>
              <p>No pending reflections.</p>
            </div>
          ) : (
            unresolvedExecutions.map((plan) => <PostAnalysisClient key={plan.id} plan={plan} />)
          )}
        </div>

        <div className="stack-lg">
          <h3>Active Playbook</h3>

          {playbooks.length === 0 ? (
            <div className="card empty-state border-dashed" style={{ background: "transparent" }}>
              <p>Complete reflections to build incident intelligence.</p>
            </div>
          ) : (
            playbooks.map((pb) => {
              const score = (pb.effectiveness as any)?.score || 0;
              const verdict = (pb.effectiveness as any)?.verdict || "unknown";
              const borderColor = verdict === "success" ? "var(--success)" : verdict === "failure" ? "var(--danger)" : "var(--accent)";

              return (
                <div key={pb.id} className="card stack" style={{ borderLeft: `3px solid ${borderColor}` }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h4 style={{ textTransform: "capitalize" }}>{(pb.incidentClass || "Unknown").replace(/_/g, " ")}</h4>
                    <span className="badge">{(score * 100).toFixed(0)}%</span>
                  </div>

                  <div className="grid two" style={{ gap: "0.75rem" }}>
                    <div className="card-flat">
                      <p className="text-xs uppercase muted">Predicted</p>
                      <p className="text-sm font-medium">Cost: ${((pb.predictedOutcome as any)?.cost || 0).toLocaleString()}</p>
                    </div>
                    <div className="card-flat">
                      <p className="text-xs uppercase muted">Actual</p>
                      <p className="text-sm font-medium">Cost: {(pb.actualOutcome as any)?.cost ? "$" + (pb.actualOutcome as any).cost.toLocaleString() : "Unknown"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase muted" style={{ marginBottom: "0.3rem" }}>Learnings</p>
                    <ul style={{ paddingLeft: "1.1rem", listStyle: "disc" }}>
                      {((pb.learnings as string[]) || []).map((l, i) => (
                        <li key={i} className="text-sm" style={{ marginBottom: "0.15rem" }}>{l}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
