import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/db";
import { BackboardClient } from "../memory/backboard-client";
import { listZapierMCPTools } from "../zapier/mcp-client";
import { getZapierMCPConfigForCompany } from "../zapier/mcp-config";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

export type ActionDraft = {
    type: "email" | "erp_update" | "zapier_action" | "zapier_mcp";
    recipientOrEndpoint: string;
    payloadOrBody: string;
    requiresHumanApproval: boolean;
};

export type MitigationPlanOutput = {
    actions: ActionDraft[];
    executionMode: "autonomous" | "human_in_loop";
    summary: string;
};

export async function generateMitigationPlan(
    companyId: string,
    riskCaseId: string,
    scenarioId: string,
): Promise<MitigationPlanOutput> {
    const company = await db.company.findUnique({
        where: { id: companyId },
        include: {
            memoryThreads: { where: { agentType: "SIGNAL_RISK" } },
            baseProfile: true,
            integrations: true,
        }
    });

    const riskCase = await db.riskCase.findUnique({
        where: { id: riskCaseId },
    });

    const scenario = await db.scenario.findUnique({
        where: { id: scenarioId },
    });

    if (!company || !riskCase || !scenario) {
        throw new Error("Missing required entities for mitigation planning.");
    }

    const zapierMCPConfig = await getZapierMCPConfigForCompany(companyId);
    const mcpTools: { name: string; description?: string }[] = zapierMCPConfig
        ? await listZapierMCPTools(zapierMCPConfig).catch(() => [])
        : [];

    const actionTypesDesc = [
        "email (use zapier_mcp to send)",
        "zapier_mcp (only when Zapier MCP is configured; payloadOrBody = JSON: {\"toolName\":\"<exact_tool_name>\",\"arguments\":{...}}; use only tools listed below)",
        "zapier_action (legacy; payloadOrBody = action/authentication/input for Zapier REST API)",
        "erp_update (simulated)",
    ].join(", ");

    const mcpToolsBlock =
        mcpTools.length > 0
            ? `\n## Available Zapier MCP tools (use type "zapier_mcp" and payloadOrBody = JSON with "toolName" and "arguments")\n${mcpTools.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n")}\n`
            : "";

    const promptText = `
    You are the Autonomous Action Layer Agent.
    Your job is to translate an approved theoretical risk mitigation scenario into concrete executable actions.
    
    ## Company Profile
    Name: ${company.name}
    Sector: ${company.baseProfile?.sector || "Unknown"}
    Connected Integrations: ${company.integrations.map((i) => i.provider).join(", ")}
    ${mcpToolsBlock}
    ## The Incident Context
    Trigger: ${riskCase.triggerType}
    Details: ${JSON.stringify(riskCase.entityMap)}
    Severity: ${riskCase.severity}
    
    ## The Selected Strategy
    Chosen Scenario: ${scenario.name}
    Recommendation Path: ${scenario.recommendation}
    Cost Delta: ${scenario.costDelta}
    Service Impact: ${scenario.serviceImpact}
    Risk Reduction: ${scenario.riskReduction}
    
    ## Your Task
    Based on the chosen scenario and the incident context, draft the concrete execution commands required to resolve this issue. Generate EXACTLY a JSON array of actions and a summary.
    Possible action types: ${actionTypesDesc}
    
    For executionMode, default to "human_in_loop" since this is a high-stakes supply chain decision.
    
    Return your output strictly as JSON matching the requested schema. No markdown wrapping.
    Output Form:
    {
      "actions": [
        { "type": "email", "recipientOrEndpoint": "supplier@example.com", "payloadOrBody": "Dear Supplier...", "requiresHumanApproval": true },
        { "type": "zapier_mcp", "recipientOrEndpoint": "", "payloadOrBody": "{\"toolName\":\"<name_from_list>\",\"arguments\":{\"key\":\"value\"}}", "requiresHumanApproval": true }
      ],
      "executionMode": "human_in_loop",
      "summary": "Drafted supplier escalation and Zapier MCP actions."
    }
  `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptText,
        config: {
            responseMimeType: "application/json",
        }
    });

    if (!response.text) throw new Error("No response from generating mitigation plan");
    const output: MitigationPlanOutput = JSON.parse(response.text);

    // Save the Mitigation Plan to Prisma
    const plan = await db.mitigationPlan.create({
        data: {
            companyId,
            riskCaseId,
            scenarioId,
            status: "DRAFTED",
            actions: output.actions as any,
            executionMode: output.executionMode,
        }
    });

    // Log to Backboard Memory
    const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
    const threadId = company.memoryThreads[0]?.backboardThreadId;

    if (backboard.isConfigured() && threadId) {
        await backboard.appendReasoning(threadId, {
            action: "Mitigation Plan Generated",
            scenarioChosen: scenario.name,
            draftedActions: output.actions,
            status: "Awaiting Human Approval"
        });
    }

    return output;
}
