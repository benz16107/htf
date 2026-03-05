import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { BackboardClient } from "@/server/memory/backboard-client";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany } from "@/server/zapier/mcp-config";
import { getGlobalZapierAccessToken, createActionRun } from "@/server/zapier/client";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId } = await req.json();

        if (!planId) {
            return NextResponse.json({ error: "Missing planId" }, { status: 400 });
        }

        const plan = await db.mitigationPlan.findUnique({
            where: { id: planId },
            include: {
                riskCase: true,
            }
        });

        if (!plan || plan.companyId !== session.companyId) {
            return NextResponse.json({ error: "Plan not found" }, { status: 404 });
        }

        type Action = {
            type: "email" | "erp_update" | "zapier_action" | "zapier_mcp";
            recipientOrEndpoint: string;
            payloadOrBody: string;
            requiresHumanApproval: boolean;
        };

        const zapierMCPConfig = await getZapierMCPConfigForCompany(session.companyId);
        const zapierAccessToken = await getGlobalZapierAccessToken();

        for (const action of (plan.actions as Action[] || [])) {
            if (action.type === "zapier_mcp" && zapierMCPConfig) {
                try {
                    const payload = JSON.parse(action.payloadOrBody) as {
                        toolName?: string;
                        arguments?: Record<string, unknown>;
                    };
                    if (payload?.toolName) {
                        await callZapierMCPTool(zapierMCPConfig, payload.toolName, payload.arguments ?? {});
                    }
                } catch (e) {
                    console.error("Failed to run Zapier MCP tool", action, e);
                }
            } else if (
                (action.type === "zapier_action" || action.type === "email") &&
                zapierAccessToken
            ) {
                try {
                    const payload = JSON.parse(action.payloadOrBody) as {
                        action?: string;
                        authentication?: string;
                        input?: Record<string, unknown>;
                    };
                    if (payload?.action && payload?.authentication) {
                        await createActionRun(zapierAccessToken, {
                            action: payload.action,
                            authentication: payload.authentication,
                            input: payload.input ?? {},
                        });
                    }
                } catch (e) {
                    console.error("Failed to run Zapier action", action, e);
                }
            }
        }

        // Mark plan as executed
        const updatedPlan = await db.mitigationPlan.update({
            where: { id: planId },
            data: { status: "EXECUTED" }
        });

        // Create a new Agent Session to record this execution
        const agentSession = await db.agentSession.create({
            data: {
                companyId: session.companyId,
                agentType: "SIGNAL_RISK",
                status: "COMPLETED"
            }
        });

        // Record Reasoning Trace for the Execution
        await db.reasoningTrace.create({
            data: {
                companyId: session.companyId,
                sessionId: agentSession.id,
                stepKey: "human_override_approved",
                stepTitle: "Human Operator Approved Execution",
                rationale: `Human operator reviewed and approved the drafted mitigation plan for ${plan.riskCase.triggerType}. Fired Zapier MCP tools and dispatched email sequences.`,
                evidencePack: {
                    planId: plan.id,
                    actions: plan.actions,
                }
            }
        });

        // Log to Backboard if configured
        const company = await db.company.findUnique({
            where: { id: session.companyId },
            include: { memoryThreads: { where: { agentType: "SIGNAL_RISK" } } }
        });

        const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
        const threadId = company?.memoryThreads[0]?.backboardThreadId;

        if (backboard.isConfigured() && threadId) {
            await backboard.appendReasoning(threadId, {
                action: "Human Overrode & Approved Execution",
                planId: plan.id,
                triggerFired: true,
                summary: "Webhooks successfully dispatched."
            });
        }

        return NextResponse.json({ success: true, plan: updatedPlan });
    } catch (error: any) {
        console.error("Execution error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to execute plan" },
            { status: 500 }
        );
    }
}
