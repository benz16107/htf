import { AppHeader } from "@/components/AppHeader";

export default function RiskAssessmentPage() {
  return (
    <main className="container stack">
      <AppHeader
        title="Risk Assessment"
        subtitle="Probability, impact, and revenue-at-risk outputs"
      />

      <section className="grid two">
        <article className="card stack">
          <h3>Probability output</h3>
          <p className="muted">Point estimate: — • Band: — • Confidence: —</p>
        </article>
        <article className="card stack">
          <h3>Impact output</h3>
          <p className="muted">Severity: — • Affected SKUs/plants/customers: —</p>
        </article>
      </section>
    </main>
  );
}
