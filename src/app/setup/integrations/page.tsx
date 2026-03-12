import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import IntegrationsClient from "./IntegrationsClient";

export default async function SetupIntegrationsPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const [{ inputContextTools, executionTools }, initialGeminiModel] = await Promise.all([
    getZapierMCPToolSelections(session.companyId),
    getGeminiModelForCompany(session.companyId),
  ]);

  return (
    <AnimeStagger className="container-wide stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Integrations" subtitle="Step 2 of 5" />
      </div>
      <div data-animate-section>
        <IntegrationsClient
          initialInputContextTools={inputContextTools}
          initialExecutionTools={executionTools}
          initialGeminiModel={initialGeminiModel}
          userEmail={session.email}
        />
      </div>
    </AnimeStagger>
  );
}
