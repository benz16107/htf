import { GoogleGenAI } from "@google/genai";
import type { MitigationPlan } from "@prisma/client";
import { db } from "@/lib/db";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import { getGoogleEmailConnectionStatus } from "@/server/email/google";
import { BackboardClient } from "../memory/backboard-client";
import { listZapierMCPTools } from "../zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "../zapier/mcp-config";
import { buildMitigationPrompt } from "./prompts";

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
    type: "email" | "erp_update" | "zapier_action" | "zapier_mcp" | "insight" | "recommendation" | "notification" | "financial_report";
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

function hasGoogleSheetsExecutionTool(tools: { name: string; description?: string }[]): boolean {
    return tools.some((t) => {
        const n = t.name.toLowerCase();
        return n.includes("google sheets") || n.includes("sheet");
    });
}

function defaultFinancialReportPayload(
    triggerType: string,
    preferGoogleSheets: boolean
): string {
    void preferGoogleSheets;
    return JSON.stringify({
        format: "csv",
        spreadsheetTitle: `Financial impact - ${triggerType}`,
        tabs: [
            { name: "Overview", section: "overview" },
            { name: "Financial Impact", section: "financial_impact" },
            { name: "Scenario Comparison", section: "scenario_comparison" },
            { name: "Drivers & Assumptions", section: "drivers_assumptions" },
            { name: "Signal Details", section: "signal_details" }
        ]
    });
}

function ensureFinancialReportAction(actions: ActionDraft[], fallbackPayload: string): ActionDraft[] {
    const normalized = Array.isArray(actions) ? [...actions] : [];
    const index = normalized.findIndex((a) => a?.type === "financial_report");
    const forcePayload = (existingPayload: string | undefined): string => {
        if (!existingPayload || !existingPayload.trim()) return fallbackPayload;
        try {
            const parsed = JSON.parse(existingPayload) as Record<string, unknown>;
            const hasTabs = Array.isArray(parsed.tabs) && parsed.tabs.length > 0;
            const hasFormat = typeof parsed.format === "string" && parsed.format.length > 0;
            if (hasTabs && hasFormat) return existingPayload;
        } catch {
            // use fallback payload
        }
        return fallbackPayload;
    };
    if (index < 0) {
        normalized.push({
            type: "financial_report",
            recipientOrEndpoint: "",
            payloadOrBody: fallbackPayload,
            requiresHumanApproval: false,
            stepTitle: "Draft detailed financial impact export",
        });
        return normalized;
    }
    const existing = normalized[index];
    normalized[index] = {
        ...existing,
        payloadOrBody: forcePayload(existing.payloadOrBody),
        stepTitle: existing.stepTitle || "Draft detailed financial impact export",
        recipientOrEndpoint: existing.recipientOrEndpoint ?? "",
    };
    return normalized;
}

function collectEmailsFromUnknown(value: unknown, out: Set<string>): void {
    if (value == null) return;
    if (typeof value === "string") {
        const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
        for (const m of matches) out.add(m.toLowerCase());
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v) => collectEmailsFromUnknown(v, out));
        return;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
            const key = k.toLowerCase();
            if (key.includes("from") || key.includes("sender") || key.includes("reply") || key.includes("email")) {
                collectEmailsFromUnknown(v, out);
            } else if (typeof v === "string") {
                collectEmailsFromUnknown(v, out);
            } else if (typeof v === "object" && v != null) {
                collectEmailsFromUnknown(v, out);
            }
        }
    }
}

function pickReplyEmailFromEntityMap(entityMap: unknown): string | null {
    const emails = new Set<string>();
    collectEmailsFromUnknown(entityMap, emails);
    const list = [...emails].filter((e) => !e.endsWith("@example.com"));
    return list[0] ?? null;
}

function ensureReplyEmailAction(actions: ActionDraft[], recipient: string, triggerType: string): ActionDraft[] {
    const normalized = Array.isArray(actions) ? [...actions] : [];
    const alreadyExists = normalized.some((a) =>
        a?.type === "email" &&
        typeof a.recipientOrEndpoint === "string" &&
        a.recipientOrEndpoint.toLowerCase().includes(recipient.toLowerCase())
    );
    if (alreadyExists) return normalized;
    const subjectLine = `Re: ${triggerType}`.slice(0, 80);
    normalized.push({
        type: "email",
        recipientOrEndpoint: recipient,
        payloadOrBody: [
            `Hello,`,
            ``,
            `We received your email regarding "${triggerType}" and have started mitigation planning.`,
            `Attached is the latest financial impact report and we will share updates as actions progress.`,
            ``,
            `Best regards,`,
            `Operations Risk Team`,
        ].join("\n"),
        requiresHumanApproval: true,
        stepTitle: `Reply to sender (${subjectLine})`,
    });
    return normalized;
}

function normalizeEmailActions(actions: ActionDraft[], fallbackRecipient: string | null): ActionDraft[] {
    return (Array.isArray(actions) ? actions : []).map((action) => {
        if (action?.type !== "email") return action;
        const to = (action.recipientOrEndpoint || "").trim();
        if (to) return action;
        if (fallbackRecipient) {
            return {
                ...action,
                recipientOrEndpoint: fallbackRecipient,
                stepTitle: action.stepTitle || "Reply to sender",
            };
        }
        return {
            ...action,
            type: "recommendation",
            recipientOrEndpoint: "",
            requiresHumanApproval: false,
            payloadOrBody:
                action.payloadOrBody ||
                "Review this email step and set a recipient address before execution.",
            stepTitle: action.stepTitle || "Review email recipient",
        };
    });
}

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
    const hasGoogleSheetsTool = hasGoogleSheetsExecutionTool(mcpToolsForActions);
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
    actionTypesList.push("financial_report (ALWAYS include exactly one in every plan; payloadOrBody = JSON with output format and optional tabs; include custom tab names/sections where useful)");
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

    const promptText = buildMitigationPrompt({
        companyName: company.name,
        sector: company.baseProfile?.sector || "Unknown",
        inputContextToolsCsv: toolSelections.inputContextTools.join(", ") || "None",
        executionToolsCsv: toolSelections.executionTools.join(", ") || "None",
        executionToolsBlock,
        inputContextNote,
        triggerType: riskCase.triggerType,
        entityMapJson: JSON.stringify(riskCase.entityMap),
        financialImpactJson: JSON.stringify(riskCase.financialImpact ?? {}),
        severity: String(riskCase.severity ?? "UNKNOWN"),
        scenarioName: scenario.name,
        recommendationPath: scenario.recommendation,
        costDelta: String(scenario.costDelta),
        serviceImpact: String(scenario.serviceImpact),
        riskReduction: String(scenario.riskReduction),
        taskInstruction: (hasExecutionTools || hasDirectEmail)
            ? "Using ONLY the execution options listed above, produce a well-rounded execution plan. Include 1-3 \"insight\" or \"recommendation\" steps, then concrete executable actions that use ONLY those options (e.g. if direct Gmail is available, you may suggest sending an email; if Slack is in the list, you may suggest posting). You MUST include exactly one \"financial_report\" action in every plan, regardless of signal quality or severity. The financial_report payload must define custom tabs for the workbook/sheets (e.g. overview, financial impact, scenario comparison, drivers/assumptions, signal details). Default financial report format should be \"csv\" unless explicitly changed by the user. Do NOT suggest any action whose delivery path is not available."
            : "You have no execution tools enabled. Produce a plan with ONLY \"insight\", \"recommendation\", and exactly one \"financial_report\" action (csv by default) with custom tabs described in payload. Do NOT suggest sending email, posting to Slack, or any other execution action-only observations and recommendations for the operator.",
        actionTypesDesc,
        outputForm: (hasExecutionTools || hasDirectEmail)
            ? `{
      "actions": [
        { "type": "insight", "recipientOrEndpoint": "", "payloadOrBody": "Consider contacting backup suppliers given the 3-month delay.", "requiresHumanApproval": false, "stepTitle": "Key consideration" },
        { "type": "recommendation", "recipientOrEndpoint": "", "payloadOrBody": "Escalate to procurement lead within 24h.", "requiresHumanApproval": false, "stepTitle": "Next step" }
        , { "type": "financial_report", "recipientOrEndpoint": "", "payloadOrBody": "{\\"format\\":\\"csv\\",\\"tabs\\":[{\\"name\\":\\"Overview\\",\\"section\\":\\"overview\\"},{\\"name\\":\\"Financial Impact\\",\\"section\\":\\"financial_impact\\"},{\\"name\\":\\"Scenario Comparison\\",\\"section\\":\\"scenario_comparison\\"}]}", "requiresHumanApproval": false, "stepTitle": "Draft detailed financial impact export" }
        ${(hasSendEmailTool || hasDirectEmail) ? ', { "type": "email", "recipientOrEndpoint": "supplier@example.com", "payloadOrBody": "Dear Supplier...", "requiresHumanApproval": true, "stepTitle": "Notify primary supplier" }' : ""}
        ${hasExecutionTools ? ', { "type": "zapier_mcp", "recipientOrEndpoint": "", "payloadOrBody": "{\\"toolName\\":\\"<exact_name_from_list>\\",\\"arguments\\":{...}}", "requiresHumanApproval": true, "stepTitle": "..." }' : ""}
      ],
      "executionMode": "human_in_loop",
      "summary": "Drafted insights and execution steps using enabled tools only."
    }`
            : `{
      "actions": [
        { "type": "insight", "recipientOrEndpoint": "", "payloadOrBody": "Consider contacting backup suppliers given the 3-month delay.", "requiresHumanApproval": false, "stepTitle": "Key consideration" },
        { "type": "financial_report", "recipientOrEndpoint": "", "payloadOrBody": "{\\"format\\":\\"csv\\"}", "requiresHumanApproval": false, "stepTitle": "Draft detailed financial impact export" },
        { "type": "recommendation", "recipientOrEndpoint": "", "payloadOrBody": "Connect direct Gmail or add an execution tool (e.g. Gmail: Send Email) in Integrations to enable sending emails from plans.", "requiresHumanApproval": false, "stepTitle": "Enable integrations" }
      ],
      "executionMode": "human_in_loop",
      "summary": "Insights and recommendations only; no execution tools enabled."
    }`,
    });

    const model = await getGeminiModelForCompany(companyId);
    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            responseMimeType: "application/json",
        }
    });

    if (!response.text) throw new Error("No response from generating mitigation plan");
    const output = parseMitigationPlanResponse(response.text);
    const preferredPayload = defaultFinancialReportPayload(riskCase.triggerType, hasGoogleSheetsTool);
    output.actions = ensureFinancialReportAction(output.actions, preferredPayload);
    const replyToEmail = pickReplyEmailFromEntityMap(riskCase.entityMap);
    output.actions = normalizeEmailActions(output.actions, replyToEmail);
    if (replyToEmail) {
        output.actions = ensureReplyEmailAction(output.actions, replyToEmail, riskCase.triggerType);
    }
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
        try {
            await backboard.appendReasoning(threadId, {
                action: "Mitigation Plan Generated",
                scenarioChosen: scenario.name,
                draftedActions: output.actions,
                status: executionMode === "autonomous" ? "Queued for Autonomous Execution" : "Awaiting Human Approval"
            });
        } catch (error) {
            // Backboard memory logging should never fail the user-facing plan generation flow.
            console.warn("Backboard appendReasoning failed during mitigation plan generation:", error);
        }
    }

    return { ...output, planId: plan.id, plan };
}
