import Link from "next/link";
import { redirect } from "next/navigation";
import { AnimeStagger } from "@/components/AnimeStagger";
import { AppHeader } from "@/components/AppHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { getSession } from "@/lib/auth";
import { getCompanySetupSnapshot } from "@/server/company-setup";
import type { SupplyChainLink } from "@/lib/supply-chain-links";
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

function SupplyChainLinksList({ links }: { links: SupplyChainLink[] }) {
  if (!links.length) return <p className="muted text-sm">No links added yet.</p>;
  return (
    <div className="stack-sm">
      {links.map((link, index) => (
        <div className="card-flat stack-xs" key={`${link.name}-${index}`}>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {link.name || `Link ${index + 1}`}
          </p>
          <p className="muted text-sm">{[link.type, link.process, link.location].filter(Boolean).join(" - ") || "Details pending"}</p>
          <p className="text-sm">{link.purpose || "No purpose added yet."}</p>
          <p className="muted text-xs">
            Connections: {link.connections || "Not specified"}
            {link.criticality ? ` | Criticality: ${link.criticality}` : ""}
          </p>
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
    : { baselayer: null, integrations: { inputContextTools: [], executionTools: [], connectors: [] }, supplyChainLinks: [], highLevel: null };

  return (
    <AnimeStagger className="container stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Review setup" subtitle="Step 5 of 5" />
      </div>
      {saved === "high-level" ? (
        <div data-animate-section>
          <StatusBanner
            variant="success"
            title="High-level profile saved"
            message="Changes saved."
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
            <p className="muted text-sm">No tools assigned.</p>
          )}
        </article>
      </section>

      <section className="card stack" data-animate-section>
        <h3>Supply chain links</h3>
        <SupplyChainLinksList links={snapshot.supplyChainLinks} />
      </section>

      <section className="card stack" data-animate-section>
        <h3>High-level profile</h3>
        <DataList data={snapshot.highLevel} />

        <hr className="divider" />
        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <Link className="btn secondary btn-sm" href="/setup/baselayer">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              edit
            </span>
            Edit base
          </Link>
          <Link className="btn secondary btn-sm" href="/setup/integrations">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              route
            </span>
            Edit integrations
          </Link>
          <Link className="btn secondary btn-sm" href="/setup/high-level">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              tune
            </span>
            Edit high-level
          </Link>
          <Link className="btn secondary btn-sm" href="/setup/stakeholders">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              account_tree
            </span>
            Edit supply chain links
          </Link>
          <ConfirmSetupButton />
          <Link className="btn secondary btn-sm" href="/dashboard">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              dashboard
            </span>
            Go to dashboard
          </Link>
        </div>
      </section>
    </AnimeStagger>
  );
}
