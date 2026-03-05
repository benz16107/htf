import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";

export default async function DashboardHomePage() {
  const session = await getSession();

  let companyName = "Your Company";
  let activeRisks = 0;
  let pendingMitigations = 0;
  let recentTraces: any[] = [];

  if (session?.companyId) {
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { name: true }
    });
    if (company) companyName = company.name;

    // Fetch dynamic dashboard stats
    activeRisks = await db.riskCase.count({
      where: {
        companyId: session.companyId,
        mitigationPlans: {
          none: { status: { in: ["EXECUTED", "REFLECTED"] } }
        }
      }
    });

    pendingMitigations = await db.mitigationPlan.count({
      where: {
        companyId: session.companyId,
        status: "DRAFTED"
      }
    });

    recentTraces = await db.reasoningTrace.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
      take: 5
    });
  }

  return (
    <div className="stack" style={{ gap: "2rem", maxWidth: "1200px" }}>
      <AppHeader
        title={<span style={{ background: "linear-gradient(90deg, var(--foreground), var(--primary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Overview: {companyName}</span> as any}
        subtitle="Global supply chain control center and risk fusion dashboard."
      />

      {/* Top Metrics Row */}
      <section className="grid four" style={{ gap: "1rem" }}>
        <article className="card stack hover-lift" style={{ padding: "1.5rem", borderTop: activeRisks > 0 ? "4px solid var(--danger)" : "4px solid var(--success)", transition: "transform 0.2s ease, box-shadow 0.2s ease", cursor: "default" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <p className="muted" style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 600, margin: 0, letterSpacing: "0.5px" }}>Active Triggers</p>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: activeRisks > 0 ? "var(--danger)" : "var(--success)", boxShadow: `0 0 10px ${activeRisks > 0 ? "var(--danger)" : "var(--success)"}` }} />
          </div>
          <h2 style={{ fontSize: "3rem", margin: "0.5rem 0 0 0", lineHeight: 1, color: activeRisks > 0 ? "var(--danger)" : "var(--foreground)", fontWeight: 700 }}>{activeRisks}</h2>
          <p style={{ color: activeRisks > 0 ? "var(--danger)" : "var(--success)", fontSize: "0.9rem", marginTop: "0.5rem", fontWeight: 500 }}>
            {activeRisks > 0 ? "Warning: Assessment needed" : "All systems normal"}
          </p>
        </article>

        <article className="card stack hover-lift" style={{ padding: "1.5rem", borderTop: pendingMitigations > 0 ? "4px solid var(--accent)" : "4px solid var(--border)", transition: "transform 0.2s ease", cursor: "default" }}>
          <p className="muted" style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 600, margin: 0, letterSpacing: "0.5px" }}>Pending Scenarios</p>
          <h2 style={{ fontSize: "3rem", margin: "0.5rem 0 0 0", lineHeight: 1, color: pendingMitigations > 0 ? "var(--accent)" : "var(--foreground)", fontWeight: 700 }}>{pendingMitigations}</h2>
          <p className={pendingMitigations > 0 ? "" : "muted"} style={{ fontSize: "0.9rem", marginTop: "0.5rem", fontWeight: pendingMitigations > 0 ? 500 : 400 }}>
            {pendingMitigations > 0 ? "Awaiting human override" : "No drafts waiting"}
          </p>
        </article>

        <article className="card stack hover-lift" style={{ padding: "1.5rem", borderTop: "4px solid var(--border)", transition: "transform 0.2s ease" }}>
          <p className="muted" style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 600, margin: 0, letterSpacing: "0.5px" }}>Escalation Health</p>
          <h2 style={{ fontSize: "3rem", margin: "0.5rem 0 0 0", lineHeight: 1, fontWeight: 700 }}>100<span style={{ fontSize: "1.5rem", opacity: 0.5 }}>%</span></h2>
          <div style={{ width: "100%", height: "4px", backgroundColor: "var(--success)", borderRadius: "2px", marginTop: "0.5rem" }} />
          <p className="muted" style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>Zero threshold breaches</p>
        </article>

        <article className="card stack hover-lift" style={{ padding: "1.5rem", background: "linear-gradient(135deg, var(--foreground) 0%, #333 100%)", color: "var(--background)", border: "none", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", transition: "transform 0.2s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ opacity: 0.8, fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 600, margin: 0, letterSpacing: "0.5px" }}>Agent Mode</p>
            <span style={{ fontSize: "0.7rem", fontWeight: "bold", padding: "2px 8px", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: "10px", textTransform: "uppercase" }}>Active</span>
          </div>
          <h2 style={{ fontSize: "2.2rem", margin: "0.5rem 0 0 0", lineHeight: 1.1, fontWeight: 600 }}>Human in Loop</h2>
          <p style={{ opacity: 0.7, fontSize: "0.9rem", marginTop: "0.5rem", lineHeight: 1.4 }}>Generative actions require explicit permission.</p>
        </article>
      </section>

      <section className="grid" style={{ gap: "2rem", gridTemplateColumns: "3fr 2fr" }}>
        {/* Recent Events (Real Traces) */}
        <article className="card stack" style={{ padding: "0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 1rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>Recent Agent Traces</h3>
            <Link href="/dashboard/logs" className="btn secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem" }}>View Timeline</Link>
          </div>

          <div className="stack" style={{ padding: "0" }}>
            {recentTraces.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>
                <p className="muted">No recent operations recorded.</p>
              </div>
            ) : (
              recentTraces.map((trace, index) => (
                <div key={trace.id} className="hover-bg-soft" style={{ display: "flex", gap: "1.5rem", padding: "1.25rem 1.5rem", borderBottom: index < recentTraces.length - 1 ? "1px solid var(--border)" : "none", alignItems: "flex-start", backgroundColor: "var(--background)", transition: "background-color 0.2s ease" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "var(--primary)", boxShadow: "0 0 0 4px var(--surface-soft)" }} />
                    {index < recentTraces.length - 1 && <div style={{ width: "2px", height: "40px", backgroundColor: "var(--border)" }} />}
                  </div>
                  <div>
                    <strong style={{ fontSize: "1rem" }}>{trace.stepTitle}</strong>
                    <p className="muted" style={{ fontSize: "0.9rem", marginTop: "0.4rem", lineHeight: 1.5, maxWidth: "600px" }}>{trace.rationale}</p>
                    <span style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.75rem", padding: "0.15rem 0.6rem", borderRadius: "12px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                      {new Date(trace.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {/* Setup Configuration Status */}
        <div className="stack" style={{ gap: "2rem" }}>
          <article className="card stack" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>Base Topology Status</h3>
            </div>

            <ul className="stack" style={{ gap: "1rem", listStyle: "none", padding: 0 }}>
              <li style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", backgroundColor: "var(--surface-soft)", borderRadius: "8px" }}>
                <span style={{ fontWeight: 500 }}>Entity Extractor</span>
                <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--success)" }} /> Active</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", backgroundColor: "var(--surface-soft)", borderRadius: "8px" }}>
                <span style={{ fontWeight: 500 }}>Integration Connectors</span>
                <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--success)" }} /> Synced</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", backgroundColor: "var(--surface-soft)", borderRadius: "8px" }}>
                <span style={{ fontWeight: 500 }}>High-Level Abstractions</span>
                <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--success)" }} /> Reasoned</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", backgroundColor: "var(--surface-soft)", borderRadius: "8px" }}>
                <span style={{ fontWeight: 500 }}>Memory Context Anchor</span>
                <span style={{ color: "var(--success)", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}><span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--success)" }} /> Secured</span>
              </li>
            </ul>
          </article>

          <article className="card stack" style={{ padding: "1.5rem", border: "1px dashed var(--border)", backgroundColor: "transparent", alignItems: "center", textAlign: "center" }}>
            <p className="muted" style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>The core SupplyAI architecture is fully operational. Awaiting incoming signals for anomaly scoring.</p>
            <Link href="/dashboard/triggered-risk" className="btn secondary" style={{ marginTop: "1rem" }}>Simulate Signal Event</Link>
          </article>
        </div>
      </section>
    </div>
  );
}
