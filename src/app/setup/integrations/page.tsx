import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import IntegrationsClient from "./IntegrationsClient";

export default async function SetupIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) {
    redirect("/sign-in");
  }

  const existing = await db.integrationConnection.findMany({
    where: { companyId: session.companyId },
    select: { provider: true },
  });
  const connectors = existing.map((row) => row.provider);

  return (
    <main className="container stack">
      <AppHeader title="Setup: Integrations" subtitle="Step 2 of 4" />
      <IntegrationsClient initialConnectors={connectors} />
    </main>
  );
}
