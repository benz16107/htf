import { AppHeader } from "@/components/AppHeader";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { SupplyChainLinksExplorer } from "@/components/SupplyChainLinksExplorer";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCompanySetupSnapshot } from "@/server/company-setup";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const snapshot = session.companyId
    ? await getCompanySetupSnapshot(session.companyId)
    : { baselayer: null, integrations: { inputContextTools: [], executionTools: [], connectors: [] }, supplyChainLinks: [], highLevel: null };

  return (
    <main className="container stack-xl">
      <AppHeader title="Company profile" />

      <section className="card stack">
        <h3>Identity</h3>
        <div className="stack-sm">
          <div className="list-row"><span className="muted text-sm">Email</span><span className="text-sm">{session.email}</span></div>
          <div className="list-row"><span className="muted text-sm">Role</span><span className="text-sm">Owner</span></div>
        </div>
      </section>

      <section className="grid two" style={{ alignItems: "start" }}>
        <article className="card stack">
          <h3>Base profile</h3>
          {snapshot.baselayer ? (
            <div className="stack-sm">
              {Object.entries(snapshot.baselayer).map(([key, value]) => (
                <div className="card-flat" key={key}>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)", textTransform: "capitalize" }}>{key}</p>
                  <p className="muted text-sm">{value || "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm">Not configured yet.</p>
          )}
        </article>

        <article className="card stack">
          <h3>High-level profile</h3>
          {snapshot.highLevel ? (
            <div className="stack-sm">
              {Object.entries(snapshot.highLevel).map(([key, value]) => (
                <div className="card-flat" key={key}>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)", textTransform: "capitalize" }}>{key}</p>
                  <p className="muted text-sm">{value || "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm">Not configured yet.</p>
          )}
        </article>
      </section>

      <section className="card stack">
        <h3>Supply chain links</h3>
        <SupplyChainLinksExplorer links={snapshot.supplyChainLinks} />
      </section>

      <DeleteAccountSection />
    </main>
  );
}
