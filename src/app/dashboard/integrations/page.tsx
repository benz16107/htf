import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import IntegrationsDashboardClient from "./IntegrationsDashboardClient";

export default async function DashboardIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) {
    redirect("/sign-in");
  }

  const existing = await db.integrationConnection.findMany({
    where: { companyId: session.companyId },
    select: { provider: true },
  });
  const connectors = existing.map((r) => r.provider);

  return (
    <>
      <AppHeader title="Integrations" subtitle="Zapier connectors" />
      <IntegrationsDashboardClient initialConnectors={connectors} />
    </>
  );
}
