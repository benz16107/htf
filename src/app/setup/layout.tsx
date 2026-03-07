import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        <Link
          href="/"
          className="row gap-2xs"
          style={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
        >
          <div className="sidebar-logo-mark" />
          <span style={{ fontWeight: 700, fontSize: "1.0625rem", letterSpacing: "-0.03em" }}>
            PENTAGON
          </span>
          <span className="muted text-sm" style={{ marginLeft: "var(--space-2)" }}>
            Setup
          </span>
        </Link>
        <Link href="/dashboard" className="btn secondary btn-sm">
          Dashboard
        </Link>
      </header>
      {children}
    </div>
  );
}
