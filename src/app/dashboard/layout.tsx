import { redirect } from "next/navigation";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import { DashboardSidebar } from "@/components/DashboardSidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!(await hasCompletedSetup())) redirect("/setup/baselayer");

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="sidebar">
        <DashboardSidebar email={session.email} />
      </aside>

      <main style={{ flex: 1, marginLeft: 240, padding: "2rem", overflowY: "auto", minHeight: "100vh" }}>{children}</main>
    </div>
  );
}
