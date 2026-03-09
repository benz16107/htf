import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/autonomous/cases
 * Returns recent risk cases created by the autonomous agent.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    return NextResponse.json({
      cases: autonomousCases.map((rc) => ({
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
      })),
    });
  } catch (err) {
    console.error("GET /api/agents/autonomous/cases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load autonomous cases" },
      { status: 500 }
    );
  }
}
