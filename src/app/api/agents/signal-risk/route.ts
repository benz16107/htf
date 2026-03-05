import { NextResponse } from "next/server";
import { runSignalRiskAgent, RiskCaseInput } from "@/server/agents/signal-agent";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        // Validate input briefly
        if (!body.triggerType || !body.entityMap || !body.timeWindow) {
            return NextResponse.json(
                { error: "Missing required fields: triggerType, entityMap, or timeWindow" },
                { status: 400 }
            );
        }

        const agentInput: RiskCaseInput = {
            triggerType: body.triggerType,
            entityMap: body.entityMap,
            timeWindow: {
                startDate: body.timeWindow.startDate || body.timeWindow.detectionTime || new Date().toISOString().split('T')[0],
                expectedDurationDays: body.timeWindow.expectedDurationDays ||
                    (typeof body.timeWindow.impactWindow === 'string' && body.timeWindow.impactWindow.includes('4_days') ? 4 : 7),
            },
            assumptions: body.assumptions || [],
        };

        const output = await runSignalRiskAgent(session.companyId, agentInput);

        return NextResponse.json({ success: true, riskAssessment: output });
    } catch (error: any) {
        console.error("Signal Risk Agent Error:", error);
        if (error.message) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }
        return NextResponse.json(
            { error: "Failed to run risk assessment" },
            { status: 500 }
        );
    }
}
