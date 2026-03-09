import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TriggeredRiskClient } from "./TriggeredRiskClient";

export default async function TriggeredRiskPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const config = await db.autonomousAgentConfig.findUnique({
    where: { companyId: session.companyId },
    select: { signalSources: true },
  });
  const signalSources =
    config?.signalSources === "internal_only" || config?.signalSources === "external_only"
      ? config.signalSources
      : "both";

  return (
    <AnimeStagger className="stack-xl risk-page-container" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Signals & risk" />
      </div>
      <div data-animate-section>
        <TriggeredRiskClient signalSources={signalSources} />
      </div>
    </AnimeStagger>
  );
}
