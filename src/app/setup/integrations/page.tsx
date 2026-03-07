import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import IntegrationsClient from "./IntegrationsClient";

export default async function SetupIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const { inputContextTools, executionTools } = await getZapierMCPToolSelections(session.companyId);

  return (
    <main className="container-wide stack-xl">
      <AppHeader title="Integrations" subtitle="Step 2 of 4" />
      <IntegrationsClient
        initialInputContextTools={inputContextTools}
        initialExecutionTools={executionTools}
        userEmail={session.email}
      />
    </main>
  );
}
