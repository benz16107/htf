/**
 * Explains how risk detection works: auto threat detection from company profile,
 * internal (direct email, connected tools, live events) vs external signals, and manual preventive checks.
 */
export function RiskDetectionOverview() {
  return (
    <section className="card stack">
      <h3>How risk detection works</h3>
      <p className="text-sm">
        Auto threat detection runs across all aspects of the supply chain. Threats are determined by reasoning from your <strong>company profile</strong> and differ by industry.
      </p>

      <div className="stack-sm">
        <div>
          <span className="trace-title text-sm">Internal (email + connected tools)</span>
          <p className="muted text-xs mt-2xs">What has happened inside your systems, inboxes, and business apps</p>
          <ul className="text-sm muted list-disc mt-2xs">
            <li>Direct Gmail sync, live email events, Calendar</li>
            <li>ShipStation, Shippo</li>
            <li>Shopify, NetSuite</li>
          </ul>
        </div>

        <div>
          <span className="trace-title text-sm">External</span>
          <p className="muted text-xs mt-2xs">Shipping disruptions, news, search (e.g. Gemini / automated)</p>
          <ul className="text-sm muted list-disc mt-2xs">
            <li>Natural causes (disasters, earthquake, tsunami)</li>
            <li>Supplier shortage</li>
            <li>Geopolitical conflicts, wars</li>
            <li>Pandemics</li>
            <li>Cyberattacks</li>
            <li>Labor strikes</li>
          </ul>
        </div>
      </div>

      <p className="text-sm">
        Any <strong>auto-triggered events</strong> are passed to reasoning. You can also run a <strong>manual preventive check</strong> below to simulate a potential threat.
      </p>
    </section>
  );
}
