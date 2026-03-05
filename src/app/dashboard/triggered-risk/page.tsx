import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TriggerRiskButton } from "@/components/TriggerRiskButton";

export default async function TriggeredRiskPage() {
  const session = await getSession();

  if (!session?.companyId) {
    redirect("/sign-in");
  }

  // Temporary mock data for the UI
  const fusedEvents = [
    {
      id: "ev-1029",
      time: "14 mins ago",
      source: "Shopify -> Netsuite Sync",
      signal: "Unexpected spike in SKU-4421 orders paired with low primary warehouse inventory.",
      riskLevel: "High",
    },
    {
      id: "ev-1028",
      time: "2 hours ago",
      source: "Email Parser",
      signal: "Vendor 'GlobalTech Industries' noted a potential 3-day delay in shipping component X.",
      riskLevel: "Moderate",
    },
    {
      id: "ev-1027",
      time: "1 day ago",
      source: "ShipStation Webhook",
      signal: "Weather delay reported for Midwest routing hub impacting 14 deliveries.",
      riskLevel: "Low",
    }
  ];

  return (
    <div className="stack" style={{ gap: "2rem", maxWidth: "1200px" }}>
      <AppHeader
        title="Risk & Incidents"
        subtitle="Live event fusion log and active risk triggers."
      />

      <section className="grid" style={{ gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
        <article className="card stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>
            <h3>Event Fusion Log</h3>
            <span className="muted" style={{ fontSize: "0.85rem" }}>Live Feed</span>
          </div>

          <p className="muted" style={{ marginBottom: "1rem" }}>
            The Event Fusion engine continuously parses signals from your connected Zapier plugins, mapping them against your High-Level Company Profile to detect anomalies.
          </p>

          <div className="stack" style={{ gap: "1rem" }}>
            {fusedEvents.map(event => (
              <div key={event.id} className="pad radius" style={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)" }}>{event.source}</span>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>{event.time}</span>
                </div>
                <p style={{ lineHeight: 1.5 }}>"{event.signal}"</p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                    backgroundColor: event.riskLevel === "High" ? "rgba(255, 79, 0, 0.15)" : "var(--surface-soft)",
                    color: event.riskLevel === "High" ? "#ff4f00" : "var(--muted)",
                    fontWeight: 600
                  }}>
                    Risk: {event.riskLevel}
                  </span>
                  {event.riskLevel === "High" && (
                    <TriggerRiskButton
                      label="Generate Mitigation Plan"
                      className="btn primary"
                      style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                      triggerType={event.source}
                      entityMap={{ details: event.signal, orderSpike: true }}
                      timeWindow={{ detectionTime: "recent", impactWindow: "current_week" }}
                      assumptions={["Demand outstripping available local supply"]}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="stack" style={{ gap: "2rem" }}>
          <div className="card stack">
            <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>Active Triggers</h3>
            <div className="pad radius stack" style={{ backgroundColor: "rgba(255, 79, 0, 0.05)", border: "1px solid rgba(255, 79, 0, 0.2)", gap: "0.5rem" }}>
              <strong style={{ color: "#ff4f00" }}>Inventory Depletion Alert</strong>
              <p style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>Projected stock-out for SKU-4421 in 4 days based on recent order velocity and vendor delays.</p>
              <TriggerRiskButton
                label="Assess Risk"
                className="btn primary"
                style={{ marginTop: "0.5rem" }}
                triggerType="Inventory Depletion Alert"
                entityMap={{ product: "SKU-4421", issue: "Projected Stockout" }}
                timeWindow={{ detectionTime: "recent", impactWindow: "4_days" }}
                assumptions={["Vendor shipments will remain delayed by 3+ days", "Demand velocity remains constant"]}
              />
            </div>
          </div>

          <div className="card stack">
            <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>System Health</h3>
            <ul className="stack" style={{ gap: "0.75rem", listStyle: "none", padding: 0, fontSize: "0.9rem" }}>
              <li style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Signal Processing</span>
                <span style={{ color: "var(--success)" }}>Online</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Anomaly Detection</span>
                <span style={{ color: "var(--success)" }}>Active</span>
              </li>
              <li style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Last Sync</span>
                <span className="muted">2 mins ago</span>
              </li>
            </ul>
          </div>
        </article>
      </section>
    </div>
  );
}
