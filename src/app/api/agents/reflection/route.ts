import { NextResponse } from "next/server";
import { runReflectionAgent, ReflectionInput } from "@/server/agents/reflection-agent";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        if (!body.mitigationPlanId || !body.actualOutcomeText) {
            return NextResponse.json(
                { error: "Missing required fields: mitigationPlanId, actualOutcomeText" },
                { status: 400 }
            );
        }

        const input: ReflectionInput = {
            mitigationPlanId: body.mitigationPlanId,
            actualOutcomeText: body.actualOutcomeText,
        };

        const output = await runReflectionAgent(session.companyId, input);

        // Transition the mitigation plan so it no longer appears in the pending list
        await db.mitigationPlan.update({
            where: { id: body.mitigationPlanId },
            data: { status: "REFLECTED" }
        });

        return NextResponse.json({ success: true, playbookEntry: output });
    } catch (error: any) {
        console.error("Reflection Agent Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to run reflection assessment" },
            { status: 500 }
        );
    }
}
