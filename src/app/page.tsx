import Link from "next/link";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import { db } from "@/lib/db";
import { LandingBackground } from "@/components/LandingBackground";

export const dynamic = "force-dynamic";

export default async function Home() {
  let session;
  let setupComplete;
  let companyName: string | null = null;
  try {
    session = await getSession();
    setupComplete = await hasCompletedSetup();
    if (session?.companyId) {
      const company = await db.company.findUnique({ where: { id: session.companyId }, select: { name: true } });
      companyName = company?.name ?? null;
    }
  } catch (e) {
    console.error("[Home] Error:", e);
    throw e;
  }

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <LandingBackground />

      <div style={{ position: "relative", zIndex: 1 }}>
        <header
          className="landing-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem var(--space-4)",
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <Link
            href="/"
            className="row gap-2xs animate-in"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="sidebar-logo-mark" />
            <span style={{ fontWeight: 700, fontSize: "1.125rem", letterSpacing: "-0.03em" }}>PENTAGON</span>
          </Link>
          <div className="row gap-sm" style={{ alignItems: "center" }}>
            {session ? (
              <>
                {companyName && (
                  <span className="text-sm muted" style={{ maxWidth: 160 }} title={companyName}>
                    {companyName}
                  </span>
                )}
                <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
                  <button type="submit" className="btn link btn-sm">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/sign-in" className="btn link btn-sm">Sign in</Link>
            )}
          </div>
        </header>
        <div className="hero">
          <h1 className="animate-in">
            Supply chain risk, <span style={{ color: "var(--accent)" }}>decoded</span>
          </h1>
          <p className="animate-in animate-in-delay-1">
            Detect signals, assess impact, run mitigation. Full traceability.
          </p>
          <div className="row center mt-lg animate-in animate-in-delay-2">
            {!session && (
              <Link className="btn primary" href="/sign-in">
                Get started
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
          </div>
        </div>

        <div className="container-wide">
          <section className="grid three mt-md">
            <article className="feature-card animate-in animate-in-delay-3">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Setup</span>
              <h3>Profile &amp; supply graph</h3>
              <p>AI builds your profile and supply chain map from minimal input.</p>
            </article>
            <article className="feature-card animate-in animate-in-delay-4">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Signals</span>
              <h3>Detect → assess → mitigate</h3>
              <p>Internal and external triggers, impact analysis, scenario-based plans.</p>
            </article>
            <article className="feature-card animate-in animate-in-delay-5">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Governance</span>
              <h3>Thresholds &amp; audit</h3>
              <p>Thresholds, human approval, full agent traces.</p>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
