import { redirect } from "next/navigation";
import { getSession, hasCompletedSetup } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { AgentHeartbeat } from "@/components/AgentHeartbeat";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!(await hasCompletedSetup())) redirect("/setup/baselayer");

  const company = session.companyId
    ? await db.company.findUnique({ where: { id: session.companyId }, select: { name: true } })
    : null;
  const companyName = company?.name ?? null;

  return (
    <div className="dashboard-shell">
      <AgentHeartbeat />
      <aside className="sidebar">
        <DashboardSidebar email={session.email} companyName={companyName} />
      </aside>
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  );
}
