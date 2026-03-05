import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AgentLogsPage() {
  const session = await getSession();

  if (!session?.companyId) {
    redirect("/sign-in");
  }

  // Temporary mock data for UI visualization
  const reasoningTraces = [
    {
      id: "trc-091a",
      time: "5 hours ago",
      agent: "AI Setup Agent",
      task: "High-Level Profiling (Lead-Time Sensitivity)",
      logic: "Inferred from base sector 'Manufacturing' + 'SMB' band that standard hardware components follow a ~35-day oceanic transit flow from APAC.",
      status: "complete"
    },
    {
      id: "trc-091b",
      time: "5 hours ago",
      agent: "AI Setup Agent",
      task: "Base Layer Summarization",
      logic: "Matched user paragraph to standard SIC taxonomy. Identified 3 primary supply chain hops: Supplier -> Assmbly -> D2C Fulfillment.",
      status: "complete"
    },
    {
      id: "trc-092x",
      time: "14 mins ago",
      agent: "Signal Reasoning Agent",
      task: "Anomaly Triage",
      logic: "Correlated a 15% Shopify order velocity spike over a 3-day trailing window against current 21-day inventory buffers in Netsuite. Resulting delta exceeds nominal bounds by 4.2%. Flagged for Mitigator Agent.",
      status: "complete"
    }
  ];

  return (
    <div className="stack" style={{ gap: "2rem", maxWidth: "1200px" }}>
      <AppHeader
        title="Agent Event Trace"
        subtitle="Explainability logs for all AI-driven decisions and inferences."
      />

      <section className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>
          <h3>System Reasoning Logic</h3>
          <span className="muted" style={{ fontSize: "0.85rem" }}>3 logs retained</span>
        </div>

        <div className="stack" style={{ gap: "1rem" }}>
          {reasoningTraces.map(trace => (
            <div key={trace.id} className="pad radius" style={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)" }}>{trace.agent}</span>
                  <span className="muted" style={{ fontSize: "0.85rem", margin: "0 0.5rem" }}>•</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{trace.task}</span>
                </div>
                <span className="muted" style={{ fontSize: "0.8rem" }}>{trace.time}</span>
              </div>

              <div style={{ backgroundColor: "var(--surface)", padding: "1rem", borderRadius: "6px", border: "1px solid var(--border)", fontFamily: "monospace", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.6 }}>
                &gt; {trace.logic}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", padding: "0.2rem 0.5rem", borderRadius: "4px", backgroundColor: "rgba(111, 140, 255, 0.1)", color: "var(--accent)", fontWeight: 600 }}>
                  {trace.id}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600, textTransform: "uppercase" }}>
                  {trace.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
