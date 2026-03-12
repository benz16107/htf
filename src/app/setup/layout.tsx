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
      <header className="top-app-bar">
        <div className="top-app-bar__inner">
          <Link
            href="/"
            className="row gap-2xs"
            style={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
          >
            <div className="brand-mark" />
            <span className="product-wordmark">PENTAGON</span>
            <span className="product-subtitle" style={{ marginLeft: "var(--space-2)" }}>
              Setup
            </span>
          </Link>
          <Link href="/dashboard" className="btn secondary btn-sm">
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              dashboard
            </span>
            Dashboard
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
