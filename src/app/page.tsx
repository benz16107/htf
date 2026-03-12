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
          className="top-app-bar"
        >
          <div className="top-app-bar__inner">
            <Link
              href="/"
              className="row gap-2xs animate-in"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="brand-mark" />
              <span className="product-wordmark">PENTAGON</span>
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
                    <button type="submit" className="btn link btn-sm">
                      <span className="material-symbols-rounded btn__icon" aria-hidden>
                        logout
                      </span>
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/sign-in" className="btn link btn-sm">
                  <span className="material-symbols-rounded btn__icon" aria-hidden>
                    login
                  </span>
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className="hero">
          <h1 className="animate-in">
            Supply chain risk intelligence for modern operations teams.
          </h1>
          <p className="animate-in animate-in-delay-1">
            Detect signals, assess impact, and execute mitigation with one unified workspace.
          </p>
          <div className="row center mt-lg animate-in animate-in-delay-2">
            {!session && (
              <Link className="btn primary" href="/sign-in">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  login
                </span>
                Get started
              </Link>
            )}
            {session && !setupComplete && (
              <Link className="btn primary" href="/setup/baselayer">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  checklist
                </span>
                Continue setup
              </Link>
            )}
            {session && setupComplete && (
              <Link className="btn primary" href="/dashboard">
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  dashboard
                </span>
                Open dashboard
              </Link>
            )}
          </div>
        </div>

        <div className="container-wide">
          <section className="grid three mt-md">
            <article className="feature-card animate-in animate-in-delay-3">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Setup</span>
              <h3>Company context</h3>
              <p>Build a clean company profile and dependency map in minutes.</p>
            </article>
            <article className="feature-card animate-in animate-in-delay-4">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Signals</span>
              <h3>Signals to action</h3>
              <p>Review internal and external signals, then run structured risk assessments.</p>
            </article>
            <article className="feature-card animate-in animate-in-delay-5">
              <span className="step-badge" style={{ alignSelf: "flex-start" }}>Governance</span>
              <h3>Approvals and traceability</h3>
              <p>Maintain human approvals, decision history, and clear execution records.</p>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
