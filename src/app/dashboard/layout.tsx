import { redirect } from "next/navigation";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const setupComplete = await hasCompletedSetup();

  if (!setupComplete) {
    redirect("/setup/baselayer");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar Navigation */}
      <aside
        style={{
          width: "260px",
          borderRight: "1px solid var(--border)",
          backgroundColor: "var(--muted-bg)",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "2rem"
        }}
      >
        <div style={{ padding: "0 0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: "24px", height: "24px", backgroundColor: "var(--foreground)", borderRadius: "6px" }} />
            <span style={{ fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.5px" }}>SupplyAI</span>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <p className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", padding: "0 0.5rem", marginBottom: "0.5rem", fontWeight: 600 }}>Operational Core</p>
          <Link href="/dashboard" className="sidebar-link">
            Overview
          </Link>
          <Link href="/dashboard/triggered-risk" className="sidebar-link">
            Risk & Incidents
          </Link>
          <Link href="/dashboard/plans" className="sidebar-link">
            Mitigation Plans
          </Link>
          <Link href="/dashboard/post-analysis" className="sidebar-link">
            Playbook & Analysis
          </Link>

          <p className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", padding: "0 0.5rem", marginBottom: "0.5rem", marginTop: "1.5rem", fontWeight: 600 }}>System Config</p>
          <Link href="/dashboard/profile" className="sidebar-link">
            Company Profile
          </Link>
          <Link href="/dashboard/logs" className="sidebar-link">
            Agent Event Trace
          </Link>
          <Link href="/dashboard/integrations" className="sidebar-link">
            Integrations
          </Link>
        </nav>

        <div style={{ marginTop: "auto", padding: "0.5rem" }}>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>{session.email}</p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--foreground)",
                opacity: 0.7,
                fontSize: "0.85rem",
                padding: 0
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto", backgroundColor: "var(--background)" }}>
        {children}
      </main>
    </div>
  );
}
