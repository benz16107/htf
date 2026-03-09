import Link from "next/link";
import { redirect } from "next/navigation";
import { AnimeStagger } from "@/components/AnimeStagger";
import { AppHeader } from "@/components/AppHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { getSession } from "@/lib/auth";
import { getCompanySetupSnapshot } from "@/server/company-setup";
import { ConfirmSetupButton } from "./ConfirmSetupButton";

function DataList({ data }: { data: Record<string, string> | null }) {
  if (!data) return <p className="muted text-sm">Not configured yet.</p>;
  return (
    <div className="stack-sm">
      {Object.entries(data).map(([key, value]) => (
        <div className="card-flat" key={key}>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)", textTransform: "capitalize" }}>
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          <p className="muted text-sm" style={{ marginTop: "0.2rem" }}>{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export default async function SetupReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { saved } = await searchParams;

  const snapshot = session.companyId
    ? await getCompanySetupSnapshot(session.companyId)
    : { baselayer: null, integrations: { inputContextTools: [], executionTools: [], connectors: [] }, highLevel: null };

  return (
    <AnimeStagger className="container stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Review setup" subtitle="Step 4 of 4" />
      </div>
      {saved === "high-level" ? (
        <div data-animate-section>
          <StatusBanner
            variant="success"
            title="High-level profile saved"
            message="Setup data is up to date. Review everything below before entering the dashboard."
          />
        </div>
      ) : null}

      <section className="grid two" style={{ alignItems: "start" }} data-animate-section>
        <article className="card stack">
          <h3>Base profile</h3>
          <DataList data={snapshot.baselayer} />
        </article>
        <article className="card stack">
          <h3>Integrations</h3>
          {(snapshot.integrations?.inputContextTools?.length || snapshot.integrations?.executionTools?.length) ? (
            <div className="stack-sm">
              {snapshot.integrations.inputContextTools?.length ? (
                <div className="stack-xs">
                  <p className="text-xs font-semibold muted uppercase">Input context</p>
                  {snapshot.integrations.inputContextTools.map((c) => (
                    <div className="list-row" key={c}>
                      <span className="text-sm">{c}</span>
                      <span className="dot success" />
                    </div>
                  ))}
                </div>
              ) : null}
              {snapshot.integrations.executionTools?.length ? (
                <div className="stack-xs">
                  <p className="text-xs font-semibold muted uppercase">Execution</p>
                  {snapshot.integrations.executionTools.map((c) => (
                    <div className="list-row" key={c}>
                      <span className="text-sm">{c}</span>
                      <span className="dot success" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted text-sm">No tools assigned to input context or execution.</p>
          )}
        </article>
      </section>

      <section className="card stack" data-animate-section>
        <h3>High-level profile</h3>
        <DataList data={snapshot.highLevel} />

        <hr className="divider" />
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <Link className="btn secondary btn-sm" href="/setup/baselayer">Edit base</Link>
          <Link className="btn secondary btn-sm" href="/setup/integrations">Edit integrations</Link>
          <Link className="btn secondary btn-sm" href="/setup/high-level">Edit high-level</Link>
          <ConfirmSetupButton />
          <Link className="btn secondary btn-sm" href="/dashboard">Go to dashboard</Link>
        </div>
      </section>
    </AnimeStagger>
  );
}
