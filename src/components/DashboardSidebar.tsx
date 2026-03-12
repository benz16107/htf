"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardSidebar({ companyName }: { companyName: string | null }) {
  const pathname = usePathname();
  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: "space_dashboard" },
    { href: "/dashboard/logs", label: "Autonomous agent", icon: "smart_toy" },
    { href: "/dashboard/triggered-risk", label: "Signals & risk", icon: "notification_important" },
    { href: "/dashboard/plans", label: "Mitigation plans", icon: "task_alt" },
    { href: "/dashboard/post-analysis", label: "Memory", icon: "history" },
  ] as const;
  const configLinks = [
    { href: "/dashboard/profile", label: "Company profile", icon: "apartment" },
    { href: "/dashboard/integrations", label: "Integrations", icon: "route" },
  ] as const;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      <Link href="/dashboard" className="sidebar-brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="brand-mark" />
        <span className="product-wordmark">PENTAGON</span>
      </Link>

      <nav className="stack-sm">
        <p className="sidebar-section-label">Operations</p>
        <div className="sidebar-divider" />
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href} className={`sidebar-link${isActive(link.href) ? " active" : ""}`}>
            <span className="material-symbols-rounded sidebar-link__icon" aria-hidden>
              {link.icon}
            </span>
            <span className="sidebar-link__label">{link.label}</span>
          </Link>
        ))}
      </nav>

      <nav className="stack-sm sidebar-config">
        <p className="sidebar-section-label">Configuration</p>
        <div className="sidebar-divider" />
        {configLinks.map((link) => (
          <Link key={link.href} href={link.href} className={`sidebar-link${isActive(link.href) ? " active" : ""}`}>
            <span className="material-symbols-rounded sidebar-link__icon" aria-hidden>
              {link.icon}
            </span>
            <span className="sidebar-link__label">{link.label}</span>
          </Link>
        ))}
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
