import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { getCompanySetupSnapshot } from "@/server/company-setup";
import Link from "next/link";
import { redirect } from "next/navigation";

function renderObjectTable(data: Record<string, string> | null) {
    if (!data) {
        return <p className="muted">No data provided yet.</p>;
    }

    return (
        <div className="stack" style={{ gap: "0.5rem" }}>
            {Object.entries(data).map(([key, value]) => (
                <div className="card" style={{ padding: "1rem", backgroundColor: "var(--background)" }} key={key}>
                    <strong style={{ textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1').trim()}</strong>
                    <p className="muted" style={{ marginTop: "0.5rem", lineHeight: 1.5 }}>{value || "—"}</p>
                </div>
            ))}
        </div>
    );
}

export default async function ProfileDashboardPage() {
    const session = await getSession();

    if (!session?.companyId) {
        redirect("/sign-in");
    }

    const snapshot = await getCompanySetupSnapshot(session.companyId);

    return (
        <div className="stack" style={{ gap: "2rem", maxWidth: "1200px" }}>
            <AppHeader
                title="Company Profile"
                subtitle="Manage your supply chain knowledge graph and operational baseline."
            />

            <div className="pad bg-muted radius row" style={{ justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)" }}>
                <p className="muted" style={{ margin: 0 }}>This data is actively referenced by your AI agents during risk assessment operations.</p>
                <Link href="/setup/baselayer" className="btn secondary">Re-run AI Setup Tool</Link>
            </div>

            <section className="grid two" style={{ alignItems: "start" }}>
                <article className="card stack">
                    <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>Base Attributes</h3>
                    {renderObjectTable(snapshot.baselayer)}
                </article>

                <article className="card stack">
                    <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>Connected Plugins</h3>
                    {snapshot.integrations?.connectors?.length ? (
                        <div className="grid two">
                            {snapshot.integrations.connectors.map((connector) => (
                                <div key={connector} className="pad radius" style={{ border: "1px solid var(--border)", backgroundColor: "var(--background)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--success)" }} />
                                    {connector}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="pad radius" style={{ border: "1px solid var(--border)", backgroundColor: "var(--background)" }}>
                            <p className="muted">No active Zapier bridges.</p>
                        </div>
                    )}

                    <Link href="/dashboard/integrations" className="muted" style={{ fontSize: "0.85rem", marginTop: "1rem" }}>
                        Manage Integrations →
                    </Link>
                </article>
            </section>

            <section className="card stack">
                <h3 style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "0.5rem" }}>High-Level Reasoning Graph</h3>
                <div className="grid two">
                    {renderObjectTable(snapshot.highLevel)}
                </div>
            </section>
        </div>
    );
}
