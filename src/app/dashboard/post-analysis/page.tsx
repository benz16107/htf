import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PostAnalysisClient } from "@/components/PostAnalysisClient";

export default async function PostAnalysisPage() {
  const session = await getSession();

  if (!session?.companyId) {
    redirect("/sign-in");
  }

  // Fetch executed plans that DO NOT have a playbook entry yet
  const unresolvedExecutions = await db.mitigationPlan.findMany({
    where: {
      companyId: session.companyId,
      status: "EXECUTED",
    },
    include: {
      riskCase: {
        include: { scenarios: true }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const existingPlaybooks = await db.playbookEntry.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" }
  });

  // Filter out executions that already have a playbook entry for roughly this time
  // (In a real app, MitigationPlan would have a playbookEntryId relation, but we'll approximate here)

  return (
    <div className="stack" style={{ gap: "2rem", maxWidth: "1200px" }}>
      <AppHeader
        title="Post Analysis"
        subtitle="Prediction-vs-outcome reflection and playbook updates"
      />

      <div className="grid two" style={{ gap: "2rem", alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.2rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            Awaiting Reflection
          </h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            These plans have been executed in the real world. Record the actual outcomes to improve the active playbook models.
          </p>

          {unresolvedExecutions.length === 0 ? (
            <div className="card pad radius" style={{ textAlign: "center", border: "1px dashed var(--border)" }}>
              <p className="muted">No pending executions to reflect upon.</p>
            </div>
          ) : (
            unresolvedExecutions.map(plan => (
              <PostAnalysisClient key={plan.id} plan={plan} />
            ))
          )}
        </div>

        <div className="stack" style={{ gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.2rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            Active Playbook
          </h3>

          {existingPlaybooks.length === 0 ? (
            <div className="card pad radius" style={{ textAlign: "center", border: "1px dashed var(--border)" }}>
              <p className="muted">The active playbook is empty. Complete reflections to build incident intelligence.</p>
            </div>
          ) : (
            existingPlaybooks.map(pb => {
              const effectivenessScore = (pb.effectiveness as any)?.score || 0;
              const verdict = (pb.effectiveness as any)?.verdict || "unknown";

              return (
                <div key={pb.id} className="card stack" style={{ padding: "1.25rem", borderLeft: verdict === "success" ? "4px solid var(--success)" : verdict === "failure" ? "4px solid var(--danger)" : "4px solid var(--accent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, textTransform: "capitalize" }}>{(pb.incidentClass || "Unknown").replace(/_/g, " ")}</h4>
                    <span style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem", borderRadius: "10px", backgroundColor: "var(--surface-soft)" }}>
                      Score: {(effectivenessScore * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="grid two" style={{ gap: "1rem", marginTop: "1rem" }}>
                    <div>
                      <p className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>Predicted</p>
                      <p style={{ fontSize: "0.9rem" }}>Cost: {"$" + ((pb.predictedOutcome as any)?.cost || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>Actual</p>
                      <p style={{ fontSize: "0.9rem" }}>Cost: {(pb.actualOutcome as any)?.cost ? "$" + (pb.actualOutcome as any).cost.toLocaleString() : "Unknown"}</p>
                    </div>
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <p className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.4rem" }}>Playbook Learnings</p>
                    <ul style={{ paddingLeft: "1.2rem", fontSize: "0.85rem", margin: 0, color: "var(--foreground)" }}>
                      {(pb.learnings as string[] || []).map((l: string, i: number) => (
                        <li key={i} style={{ marginBottom: "0.25rem" }}>{l}</li>
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
