import Link from "next/link";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import { AuthActions } from "@/components/AuthActions";
import SetupRedirect from "@/components/SetupRedirect";

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
    <>
      <main className="container stack">
        <section className="card stack">
          <h1>HTF 2.0 Supply Chain Risk Intelligence</h1>
          <p className="muted">
            Single multi-tenant platform for company setup, explainable AI risk
            sessions, mitigation planning, and post-incident learning.
          </p>
          <div className="row">
            {!session && (
              <Link className="btn primary" href="/sign-in">
                Sign in
              </Link>
            )}
            {session && !setupComplete && (
              <Link className="btn primary" href="/setup/baselayer">
                Continue setup
              </Link>
            )}
            {session && setupComplete && (
              <Link className="btn primary" href="/dashboard">
                Open dashboard
              </Link>
            )}
            {session && (
              <AuthActions authMode={session.authMode} />
            )}
          </div>
        </section>

        <section className="grid three">
          <article className="card stack">
            <h3>AI Setup Agent</h3>
            <p className="muted">
              Builds company base profile and high-level supply chain profile with
              traceable reasoning and warning flags when evidence is insufficient.
            </p>
          </article>
          <article className="card stack">
            <h3>Signal + Risk Agent</h3>
            <p className="muted">
              Detects disruption triggers, computes probability and impact, and
              recommends mitigation scenarios under company constraints.
            </p>
          </article>
          <article className="card stack">
            <h3>Governance Layer</h3>
            <p className="muted">
              Company-specific thresholds, human override controls, and full audit
              traces per agent session.
            </p>
          </article>
        </section>

        {session && (
          <section className="card stack">
            <h2>Signed-in context</h2>
            <p className="muted">
              Account: {session.email} • Company ID: {session.companyId ?? "PENDING"}
            </p>
            <div className="row">
              <Link className="btn" href="/profile">
                Company profile
              </Link>
              <Link className="btn" href="/setup/review">
                Setup summary
              </Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
