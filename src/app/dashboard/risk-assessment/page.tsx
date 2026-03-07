import { AppHeader } from "@/components/AppHeader";

export default function RiskAssessmentPage() {
  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Risk assessment" />

      <section className="grid two">
        <article className="card stack">
          <h3>Probability output</h3>
          <p className="muted text-sm">Point estimate: — · Band: — · Confidence: —</p>
        </article>
        <article className="card stack">
          <h3>Impact output</h3>
          <p className="muted text-sm">Severity: — · Affected SKUs/plants/customers: —</p>
        </article>
      </section>
    </div>
  );
}
