import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import IntegrationsDashboardClient from "./IntegrationsDashboardClient";

export default async function DashboardIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const { inputContextTools, executionTools } = await getZapierMCPToolSelections(session.companyId);

  return (
    <AnimeStagger className="stack-xl" style={{ maxWidth: 1100 }} itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Integrations" />
      </div>
      <div data-animate-section>
        <IntegrationsDashboardClient
          initialInputContextTools={inputContextTools}
          initialExecutionTools={executionTools}
          userEmail={session.email}
        />
      </div>
    </AnimeStagger>
  );
}
