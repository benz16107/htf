"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      <div className="sidebar-brand">
        <div style={{ width: 20, height: 20, borderRadius: 5, background: "var(--accent)" }} />
        <span>PENTAGON</span>
      </div>

      <nav className="stack-sm">
        <p className="sidebar-section-label">Operations</p>
        <Link href="/dashboard" className={`sidebar-link${isActive("/dashboard") ? " active" : ""}`}>Overview</Link>
        <Link href="/dashboard/triggered-risk" className={`sidebar-link${isActive("/dashboard/triggered-risk") ? " active" : ""}`}>Signals &amp; Risk/Impact Analysis</Link>
        <Link href="/dashboard/plans" className={`sidebar-link${isActive("/dashboard/plans") ? " active" : ""}`}>Mitigation Plans</Link>
        <Link href="/dashboard/post-analysis" className={`sidebar-link${isActive("/dashboard/post-analysis") ? " active" : ""}`}>Playbook</Link>
      </nav>

      <nav className="stack-sm sidebar-config" style={{ marginTop: "auto" }}>
        <p className="sidebar-section-label">Configuration</p>
        <Link href="/dashboard/profile" className={`sidebar-link${isActive("/dashboard/profile") ? " active" : ""}`}>Company Profile</Link>
        <Link href="/dashboard/logs" className={`sidebar-link${isActive("/dashboard/logs") ? " active" : ""}`}>Agent Traces</Link>
        <Link href="/dashboard/integrations" className={`sidebar-link${isActive("/dashboard/integrations") ? " active" : ""}`}>Integrations</Link>
      </nav>

      <div className="sidebar-footer">
        <p className="muted text-sm truncate" style={{ marginBottom: "0.4rem" }}>{email}</p>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="btn secondary btn-sm" style={{ border: "none", padding: 0 }}>Sign out</button>
        </form>
      </div>
    </>
  );
}
