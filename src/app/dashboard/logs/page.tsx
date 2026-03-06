import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AgentLogsPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const traces = [
    { id: "trc-091a", time: "5 hours ago", agent: "AI Setup Agent", task: "High-Level Profiling (Lead-Time Sensitivity)", logic: "Inferred from base sector 'Manufacturing' + 'SMB' band that standard hardware components follow a ~35-day oceanic transit flow from APAC.", status: "complete" },
    { id: "trc-091b", time: "5 hours ago", agent: "AI Setup Agent", task: "Base Layer Summarization", logic: "Matched user paragraph to standard SIC taxonomy. Identified 3 primary supply chain hops: Supplier → Assembly → D2C Fulfillment.", status: "complete" },
    { id: "trc-092x", time: "14 mins ago", agent: "Signal Reasoning Agent", task: "Anomaly Triage", logic: "Correlated a 15% Shopify order velocity spike over a 3-day trailing window against current 21-day inventory buffers. Resulting delta exceeds nominal bounds by 4.2%. Flagged for Mitigator Agent.", status: "complete" },
  ];

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Agent Event Trace" subtitle="Explainability logs for all AI-driven decisions." />

      <section className="card stack" style={{ padding: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "1.25rem 1.25rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Reasoning Log</h3>
          <span className="badge">{traces.length} entries</span>
        </div>

        <div className="stack-sm" style={{ padding: "0.75rem" }}>
          {traces.map((trace) => (
            <div key={trace.id} className="trace-row">
              <div className="trace-meta">
                <div className="row" style={{ gap: "0.4rem" }}>
                  <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>{trace.agent}</span>
                  <span className="muted text-sm">·</span>
                  <span className="font-medium text-sm">{trace.task}</span>
                </div>
                <span className="muted text-xs">{trace.time}</span>
              </div>
              <div className="trace-body">&gt; {trace.logic}</div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="badge accent">{trace.id}</span>
                <span className="badge success">{trace.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
