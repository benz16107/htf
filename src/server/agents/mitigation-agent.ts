import { GoogleGenAI } from "@google/genai";
import type { MitigationPlan } from "@prisma/client";
import { db } from "@/lib/db";
import { getGoogleEmailConnectionStatus } from "@/server/email/google";
import { BackboardClient } from "../memory/backboard-client";
import { listZapierMCPTools } from "../zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "../zapier/mcp-config";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

/** Parse LLM response that may be markdown-wrapped or have trailing commas / minor JSON errors. */
function parseMitigationPlanResponse(raw: string): MitigationPlanOutput {
    let text = raw.trim();
    // Strip markdown code blocks
    const codeBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/;
    const match = text.match(codeBlock);
    if (match) text = match[1].trim();
    // Try parse
    const tryParse = (s: string): MitigationPlanOutput => {
        const parsed = JSON.parse(s) as MitigationPlanOutput;
        if (!parsed || typeof parsed !== "object") throw new Error("Invalid plan shape");
        if (!Array.isArray(parsed.actions)) parsed.actions = [];
        if (typeof parsed.executionMode !== "string") parsed.executionMode = "human_in_loop";
        if (typeof parsed.summary !== "string") parsed.summary = "";
        return parsed;
    };
    try {
        return tryParse(text);
    } catch {
        // Fix trailing commas (common LLM mistake)
        let fixed = text.replace(/,(\s*[}\]])/g, "$1");
        try {
            return tryParse(fixed);
        } catch {
            // Try to extract a single top-level JSON object
            const start = text.indexOf("{");
            if (start >= 0) {
                let depth = 0;
                let end = -1;
                for (let i = start; i < text.length; i++) {
                    if (text[i] === "{") depth++;
                    else if (text[i] === "}") {
                        depth--;
                        if (depth === 0) {
                            end = i;
                            break;
                        }
                    }
                }
                if (end > start) {
                    fixed = text.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
                    try {
                        return tryParse(fixed);
                    } catch {
                        //
                    }
                }
            }
        }
    }
    throw new Error(
        "Mitigation plan response was not valid JSON. The model may have returned markdown or truncated output. Try again or simplify the scenario."
    );
}

export type ActionDraft = {
    type: "email" | "erp_update" | "zapier_action" | "zapier_mcp" | "insight" | "recommendation" | "notification";
    recipientOrEndpoint: string;
    payloadOrBody: string;
    requiresHumanApproval: boolean;
    /** Short human-readable step name for the execution plan */
    stepTitle?: string;
};

export type MitigationPlanOutput = {
    actions: ActionDraft[];
    executionMode: "autonomous" | "human_in_loop";
    summary: string;
};

export type GenerateMitigationPlanOptions = {
  createdByAutonomousAgent?: boolean;
  executionModeOverride?: MitigationPlanOutput["executionMode"];
};

export async function generateMitigationPlan(
    companyId: string,
    riskCaseId: string,
    scenarioId: string,
    options?: GenerateMitigationPlanOptions,
): Promise<MitigationPlanOutput & { planId: string; plan: MitigationPlan }> {
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

    const [zapierMCPConfig, toolSelections, gmailStatus] = await Promise.all([
        getZapierMCPConfigForCompany(companyId),
        getZapierMCPToolSelections(companyId),
        getGoogleEmailConnectionStatus(companyId),
    ]);
    const allMcpTools: { name: string; description?: string }[] = zapierMCPConfig
        ? await listZapierMCPTools(zapierMCPConfig).catch(() => [])
        : [];
    const executionToolSet = new Set(toolSelections.executionTools);
    const mcpToolsForActions = allMcpTools.filter((t) => executionToolSet.has(t.name));

    const hasSendEmailTool = mcpToolsForActions.some((t) => {
        const n = t.name.toLowerCase();
        return (n.includes("send") && (n.includes("email") || n.includes("gmail"))) || (n.includes("gmail") && n.includes("send"));
    });
    const hasDirectEmail = gmailStatus.connected && gmailStatus.sendReady;
    const hasExecutionTools = mcpToolsForActions.length > 0;

    const actionTypesList: string[] = [
        "insight (text-only: observation or recommendation for the operator; recipientOrEndpoint can be empty; payloadOrBody = the insight text; use for 1-2 key takeaways or suggested considerations)",
        "recommendation (text-only: suggested next step or best practice; payloadOrBody = the recommendation; use when you want to advise without executing)",
    ];
    if (hasSendEmailTool || hasDirectEmail) {
        actionTypesList.push(`email (recipientOrEndpoint = address; payloadOrBody = body; will be sent via ${hasDirectEmail ? "the direct Gmail connection" : "your enabled send-email tool"})`);
    }
    if (hasExecutionTools) {
        actionTypesList.push(`zapier_mcp (ONLY use tools from the list below; payloadOrBody = JSON: {"toolName":"<exact_tool_name_from_list>","arguments":{...}}; allowed tool names: ${mcpToolsForActions.map((t) => t.name).join(", ")})`);
    }
    actionTypesList.push("zapier_action (legacy; only if you have action/authentication/input for Zapier REST API)", "notification (use zapier_mcp with a notification tool from the list only)", "erp_update (simulated)");
    const actionTypesDesc = actionTypesList.join(", ");

    const executionToolsBlock =
        hasExecutionTools || hasDirectEmail
            ? `\n## Execution tools\n${hasDirectEmail ? "- Direct Gmail connection: available for email actions\n" : ""}${mcpToolsForActions.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n")}\n\nUse email actions when direct Gmail is available or when a send-email execution tool exists. Use zapier_mcp only for the explicit tools listed above.\n`
            : "\n## Execution tools: None enabled. Do NOT suggest sending email, Slack, CRM, or any other execution action. Only suggest \"insight\" and \"recommendation\" steps.\n";
    const inputContextNote =
        toolSelections.inputContextTools.length > 0
            ? `\n(Input context tools, used elsewhere for automatic retrieval: ${toolSelections.inputContextTools.join(", ")}. Do not use these for mitigation actions.)\n`
            : "";

    const promptText = `
    You are the Autonomous Action Layer Agent.
    Your job is to translate an approved theoretical risk mitigation scenario into concrete executable actions.
    
    ## Company Profile
    Name: ${company.name}
    Sector: ${company.baseProfile?.sector || "Unknown"}
    Input context integrations (auto retrieval): ${toolSelections.inputContextTools.join(", ") || "None"}
    Execution integrations (for mitigation actions): ${toolSelections.executionTools.join(", ") || "None"}
    ${executionToolsBlock}${inputContextNote}
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
    ${(hasExecutionTools || hasDirectEmail)
        ? "Using ONLY the execution options listed above, produce a well-rounded execution plan. Include 1-3 \"insight\" or \"recommendation\" steps, then concrete executable actions that use ONLY those options (e.g. if direct Gmail is available, you may suggest sending an email; if Slack is in the list, you may suggest posting). Do NOT suggest any action (email, Slack, CRM, etc.) whose delivery path is not available."
        : "You have no execution tools enabled. Produce a plan with ONLY \"insight\" and \"recommendation\" steps. Do NOT suggest sending email, posting to Slack, or any other execution action—only observations and recommendations for the operator."}
    Possible action types: ${actionTypesDesc}
    
    For executionMode, default to "human_in_loop".
    For each action include a "stepTitle" (short human-readable step name).
    Return your output strictly as JSON. No markdown wrapping.
    Output Form (only include action types that are allowed above; if no execution tools, only use insight and recommendation):
    ${(hasExecutionTools || hasDirectEmail)
        ? `{
      "actions": [
        { "type": "insight", "recipientOrEndpoint": "", "payloadOrBody": "Consider contacting backup suppliers given the 3-month delay.", "requiresHumanApproval": false, "stepTitle": "Key consideration" },
        { "type": "recommendation", "recipientOrEndpoint": "", "payloadOrBody": "Escalate to procurement lead within 24h.", "requiresHumanApproval": false, "stepTitle": "Next step" }
        ${(hasSendEmailTool || hasDirectEmail) ? ', { "type": "email", "recipientOrEndpoint": "supplier@example.com", "payloadOrBody": "Dear Supplier...", "requiresHumanApproval": true, "stepTitle": "Notify primary supplier" }' : ""}
        ${hasExecutionTools ? ', { "type": "zapier_mcp", "recipientOrEndpoint": "", "payloadOrBody": "{\\"toolName\\":\\"<exact_name_from_list>\\",\\"arguments\\":{...}}", "requiresHumanApproval": true, "stepTitle": "..." }' : ""}
      ],
      "executionMode": "human_in_loop",
      "summary": "Drafted insights and execution steps using enabled tools only."
    }`
        : `{
      "actions": [
        { "type": "insight", "recipientOrEndpoint": "", "payloadOrBody": "Consider contacting backup suppliers given the 3-month delay.", "requiresHumanApproval": false, "stepTitle": "Key consideration" },
        { "type": "recommendation", "recipientOrEndpoint": "", "payloadOrBody": "Connect direct Gmail or add an execution tool (e.g. Gmail: Send Email) in Integrations to enable sending emails from plans.", "requiresHumanApproval": false, "stepTitle": "Enable integrations" }
      ],
      "executionMode": "human_in_loop",
      "summary": "Insights and recommendations only; no execution tools enabled."
    }`}
  `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptText,
        config: {
            responseMimeType: "application/json",
        }
    });

    if (!response.text) throw new Error("No response from generating mitigation plan");
    const output = parseMitigationPlanResponse(response.text);
    const executionMode = options?.executionModeOverride ?? output.executionMode;

    // Save the Mitigation Plan to Prisma
    const plan = await db.mitigationPlan.create({
        data: {
            companyId,
            riskCaseId,
            scenarioId,
            status: "DRAFTED",
            actions: output.actions as any,
            executionMode,
            createdByAutonomousAgent: options?.createdByAutonomousAgent ?? false,
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
            status: executionMode === "autonomous" ? "Queued for Autonomous Execution" : "Awaiting Human Approval"
        });
    }

    return { ...output, planId: plan.id, plan };
}
