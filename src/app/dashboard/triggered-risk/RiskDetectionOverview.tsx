/**
 * Explains how risk detection works: auto threat detection from company profile,
 * internal (Zapier) vs external signals, and manual preventive checks.
 */
export function RiskDetectionOverview() {
  return (
    <section className="card stack">
      <h3>How risk detection works</h3>
      <p className="text-sm" style={{ lineHeight: 1.6, margin: 0 }}>
        Auto threat detection runs across all aspects of the supply chain. Threats are determined by reasoning from your <strong>company profile</strong> and differ by industry.
      </p>

      <div className="stack-sm">
        <div>
          <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>Internal (Zapier)</span>
          <p className="muted text-xs" style={{ margin: "0.25rem 0 0" }}>What has happened inside your systems</p>
          <ul className="text-sm muted" style={{ margin: "0.35rem 0 0", paddingLeft: "1.25rem" }}>
            <li>Emails, Calendar</li>
            <li>ShipStation, Shippo</li>
            <li>Shopify, NetSuite</li>
          </ul>
        </div>

        <div>
          <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>External</span>
          <p className="muted text-xs" style={{ margin: "0.25rem 0 0" }}>Shipping disruptions, news, search (e.g. Gemini / automated)</p>
          <ul className="text-sm muted" style={{ margin: "0.35rem 0 0", paddingLeft: "1.25rem" }}>
            <li>Natural causes (disasters, earthquake, tsunami)</li>
            <li>Supplier shortage</li>
            <li>Geopolitical conflicts, wars</li>
            <li>Pandemics</li>
            <li>Cyberattacks</li>
            <li>Labor strikes</li>
          </ul>
        </div>
      </div>

      <p className="text-sm" style={{ lineHeight: 1.5, margin: 0 }}>
        Any <strong>auto-triggered events</strong> are passed to reasoning. You can also run a <strong>manual preventive check</strong> below to simulate a potential threat.
      </p>
    </section>
  );
}
