import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import IntegrationsDashboardClient from "./IntegrationsDashboardClient";

export default async function DashboardIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const { inputContextTools, executionTools } = await getZapierMCPToolSelections(session.companyId);

  return (
    <div className="stack-xl" style={{ maxWidth: 1100 }}>
      <AppHeader title="Integrations" />
      <IntegrationsDashboardClient
        initialInputContextTools={inputContextTools}
        initialExecutionTools={executionTools}
        userEmail={session.email}
      />
    </div>
  );
}
