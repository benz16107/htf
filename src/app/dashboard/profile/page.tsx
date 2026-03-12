import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { SupplyChainLinksExplorer } from "@/components/SupplyChainLinksExplorer";
import { getSession } from "@/lib/auth";
import { getCompanySetupSnapshot } from "@/server/company-setup";
import Link from "next/link";
import { redirect } from "next/navigation";

function DataList({ data }: { data: Record<string, string> | null }) {
  if (!data) return <p className="muted text-sm">Not configured yet.</p>;
  return (
    <div className="stack-sm">
      {Object.entries(data).map(([key, value]) => (
        <div className="card-flat" key={key}>
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)", textTransform: "capitalize" }}>
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          <p className="muted text-sm" style={{ marginTop: "0.15rem", lineHeight: 1.5 }}>{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export default async function ProfileDashboardPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const snapshot = await getCompanySetupSnapshot(session.companyId);

  return (
    <AnimeStagger className="stack-xl" style={{ maxWidth: 1100 }} itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader
          title="Company profile"
          actions={
            <Link href="/setup/review" className="btn secondary btn-sm">
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                tune
              </span>
              Edit setup sections
            </Link>
          }
        />
      </div>

      <section className="card stack" data-animate-section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Base Attributes</h3>
          <Link href="/setup/baselayer" className="btn secondary btn-sm">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              edit
            </span>
            Edit
          </Link>
        </div>
        <DataList data={snapshot.baselayer} />
      </section>

      <section className="card stack" data-animate-section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>High-Level Reasoning Graph</h3>
          <Link href="/setup/high-level" className="btn secondary btn-sm">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              edit
            </span>
            Edit
          </Link>
        </div>
        <DataList data={snapshot.highLevel} />
      </section>

      <section className="card stack" data-animate-section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Supply Chain Links</h3>
          <Link href="/setup/stakeholders" className="btn secondary btn-sm">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              edit
            </span>
            Edit
          </Link>
        </div>
        <SupplyChainLinksExplorer links={snapshot.supplyChainLinks} />
      </section>

      <div data-animate-section>
        <DeleteAccountSection />
      </div>
    </AnimeStagger>
  );
}
