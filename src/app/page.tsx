import Link from "next/link";
import { getSession, hasCompletedSetup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  let session;
  let setupComplete;
  try {
    session = await getSession();
    setupComplete = await hasCompletedSetup();
  } catch (e) {
    console.error("[Home] Error:", e);
    throw e;
  }

  return (
    <main>
      <div className="hero">
        <h1>Supply Chain Risk Intelligence</h1>
        <p>
          AI-powered setup, explainable risk sessions, scenario-based mitigation
          planning, and post-incident learning — all in one platform.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
          {!session && (
            <Link className="btn primary" href="/sign-in">Get started</Link>
          )}
          {session && !setupComplete && (
            <Link className="btn primary" href="/setup/baselayer">Continue setup</Link>
          )}
          {session && setupComplete && (
            <Link className="btn primary" href="/dashboard">Open dashboard</Link>
          )}
        </div>
      </div>

      <div className="container-wide">
        <section className="grid three" style={{ marginTop: "1rem" }}>
          <article className="feature-card">
            <h3>AI Setup Agent</h3>
            <p>
              Builds your company profile and supply chain graph with traceable
              reasoning. Flags gaps when evidence is insufficient.
            </p>
          </article>
          <article className="feature-card">
            <h3>Signal + Risk Agent</h3>
            <p>
              Detects disruption triggers, computes probability and impact, and
              generates mitigation scenarios under your constraints.
            </p>
          </article>
          <article className="feature-card">
            <h3>Governance Layer</h3>
            <p>
              Company-specific thresholds, human override controls, and full
              audit traces for every agent session.
            </p>
          </article>
        </section>

        {session && (
          <section className="card stack" style={{ marginTop: "2rem" }}>
            <h3>Your account</h3>
            <p className="muted text-sm">
              {session.email} · Company {session.companyId ?? "not yet created"}
            </p>
            <div className="row">
              <Link className="btn btn-sm" href="/profile">Company profile</Link>
              <Link className="btn btn-sm" href="/setup/review">Setup summary</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
