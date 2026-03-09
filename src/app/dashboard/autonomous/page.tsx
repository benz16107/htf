import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import AutonomousAgentClient from "./AutonomousAgentClient";

export default async function AutonomousAgentPage() {
  const session = await getSession();
  if (!session?.companyId) redirect("/sign-in");

  const autonomousCases = await db.riskCase.findMany({
    where: {
      companyId: session.companyId,
      createdByAutonomousAgent: true,
    },
    include: {
      mitigationPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const recentCases = autonomousCases
    .map((rc) => ({
      id: rc.id,
      triggerType: rc.triggerType,
      severity: rc.severity,
      createdAt: rc.createdAt.toISOString(),
      latestPlan: rc.mitigationPlans[0]
        ? {
            id: rc.mitigationPlans[0].id,
            status: rc.mitigationPlans[0].status,
            updatedAt: rc.mitigationPlans[0].updatedAt.toISOString(),
          }
        : null,
    }));

  return (
    <AnimeStagger className="stack-xl" style={{ maxWidth: 800 }} itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Autonomous agent" />
      </div>
      <div data-animate-section>
        <AutonomousAgentClient recentCases={recentCases} />
      </div>
    </AnimeStagger>
  );
}
