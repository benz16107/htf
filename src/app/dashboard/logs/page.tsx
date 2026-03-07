import { AppHeader } from "@/components/AppHeader";
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
    <div className="stack-xl" style={{ maxWidth: 900 }}>
      <AppHeader
        title="Autonomous agent"
        actions={
          <Suspense fallback={<span className="text-sm muted">…</span>}>
            <LogsPageHeaderActions />
          </Suspense>
        }
      />
      <AgentRunningVisualWrapper>
        <AgentTracesClient />
      </AgentRunningVisualWrapper>
    </div>
  );
}
