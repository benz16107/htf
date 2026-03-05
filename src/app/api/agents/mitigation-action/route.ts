import { NextResponse } from "next/server";
import { generateMitigationPlan } from "@/server/agents/mitigation-agent";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        if (!body.riskCaseId || !body.scenarioId) {
            return NextResponse.json(
                { error: "Missing required fields: riskCaseId or scenarioId" },
                { status: 400 }
            );
        }

        const output = await generateMitigationPlan(
            session.companyId,
            body.riskCaseId,
            body.scenarioId
        );

        return NextResponse.json({ success: true, plan: output });
    } catch (error: any) {
        console.error("Mitigation generation error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to draft mitigation plan" },
            { status: 500 }
        );
    }
}
