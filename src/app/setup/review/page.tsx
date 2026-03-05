import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { getCompanySetupSnapshot } from "@/server/company-setup";

function renderObjectTable(data: Record<string, string> | null) {
  if (!data) {
    return <p className="muted">No data provided yet.</p>;
  }

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      {Object.entries(data).map(([key, value]) => (
        <div className="card" style={{ padding: "0.75rem" }} key={key}>
          <strong>{key}</strong>
          <p className="muted">{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export default async function SetupReviewPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const snapshot = session.companyId
    ? await getCompanySetupSnapshot(session.companyId)
    : {
        baselayer: null,
        integrations: { connectors: [] },
        highLevel: null,
      };

  return (
    <main className="container stack">
      <AppHeader title="Setup: Final Review" subtitle="Step 4 of 4" />

      <section className="grid two">
        <article className="card stack">
          <h3>Baselayer profile</h3>
          {renderObjectTable(snapshot.baselayer)}
        </article>

        <article className="card stack">
          <h3>Integrations</h3>
          {snapshot.integrations?.connectors?.length ? (
            <ul className="stack" style={{ gap: "0.4rem", listStyle: "inside" }}>
              {snapshot.integrations.connectors.map((connector) => (
                <li key={connector}>{connector}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No connectors selected.</p>
          )}
        </article>
      </section>

      <section className="card stack">
        <h3>High-level profile summary</h3>
        {renderObjectTable(snapshot.highLevel)}

        <div className="row">
          <Link className="btn" href="/setup/baselayer">
            Edit baselayer
          </Link>
          <Link className="btn" href="/setup/integrations">
            Edit integrations
          </Link>
          <Link className="btn" href="/setup/high-level">
            Edit high-level layer
          </Link>
          <form action="/api/setup/complete" method="post">
            <button className="btn primary" type="submit">
              Confirm and enter dashboard
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
