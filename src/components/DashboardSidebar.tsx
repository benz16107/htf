"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardSidebar({ email, companyName }: { email: string | null; companyName: string | null }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      <Link href="/dashboard" className="sidebar-brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="sidebar-logo-mark" />
        <span>PENTAGON</span>
      </Link>

      <nav className="stack-sm">
        <p className="sidebar-section-label">Operations</p>
        <div className="sidebar-divider" />
        <Link href="/dashboard" className={`sidebar-link${isActive("/dashboard") ? " active" : ""}`}>
          Overview
        </Link>
        <Link href="/dashboard/logs" className={`sidebar-link${isActive("/dashboard/logs") ? " active" : ""}`}>
          Autonomous agent
        </Link>
        <Link href="/dashboard/triggered-risk" className={`sidebar-link${isActive("/dashboard/triggered-risk") ? " active" : ""}`}>
          Signals &amp; risk
        </Link>
        <Link href="/dashboard/plans" className={`sidebar-link${isActive("/dashboard/plans") ? " active" : ""}`}>
          Mitigation plans
        </Link>
        <Link href="/dashboard/post-analysis" className={`sidebar-link${isActive("/dashboard/post-analysis") ? " active" : ""}`}>
          Memory
        </Link>
      </nav>

      <nav className="stack-sm sidebar-config">
        <p className="sidebar-section-label">Configuration</p>
        <div className="sidebar-divider" />
        <Link href="/dashboard/profile" className={`sidebar-link${isActive("/dashboard/profile") ? " active" : ""}`}>
          Company profile
        </Link>
        <Link href="/dashboard/integrations" className={`sidebar-link${isActive("/dashboard/integrations") ? " active" : ""}`}>
          Integrations
        </Link>
      </nav>

      <div className="sidebar-footer">
        {companyName && (
          <p className="text-sm truncate sidebar-company" style={{ margin: 0, fontWeight: 500 }} title={companyName}>
            {companyName}
          </p>
        )}
        <Link href="/" className="sidebar-footer__action">
          Back to landing page
        </Link>
        <form action="/api/auth/logout" method="post" style={{ margin: 0 }}>
          <button type="submit" className="sidebar-footer__action">Sign out</button>
        </form>
      </div>
    </>
  );
}
