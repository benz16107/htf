import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AgentTracesClient } from "./AgentTracesClient";
import { AgentRunningVisualWrapper } from "./AgentRunningVisualWrapper";
import { LogsPageHeaderActions } from "./LogsPageHeaderActions";

export const dynamic = "force-dynamic";

export default async function AgentTracesPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  return (
    <AnimeStagger className="stack-xl" style={{ maxWidth: 900 }} itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader
          title="Autonomous agent"
          actions={
            <Suspense fallback={<span className="text-sm muted">…</span>}>
              <LogsPageHeaderActions />
            </Suspense>
          }
        />
      </div>
      <div data-animate-section>
        <AgentRunningVisualWrapper>
          <AgentTracesClient />
        </AgentRunningVisualWrapper>
      </div>
    </AnimeStagger>
  );
}
