import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/db";
import { BackboardClient } from "../memory/backboard-client";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

export type ReflectionInput = {
    mitigationPlanId: string;
    actualOutcomeText: string;
};

export type PlaybookEntryOutput = {
    incidentClass: string;
    predictedOutcome: {
        cost: number;
        service: number;
    };
    actualOutcome: {
        cost: number | null;
        service: number | null;
        notes: string;
    };
    effectiveness: {
        score: number;
        verdict: "success" | "partial" | "failure";
    };
    learnings: string[];
};

export async function runReflectionAgent(
    companyId: string,
    input: ReflectionInput,
): Promise<PlaybookEntryOutput> {
    // 1. Fetch the full incident context
    const plan = await db.mitigationPlan.findUnique({
        where: { id: input.mitigationPlanId },
        include: {
            riskCase: {
                include: { scenarios: true }
            }
        }
    });

    if (!plan || plan.companyId !== companyId) {
        throw new Error("Mitigation plan not found");
    }

    const chosenScenario = plan.riskCase.scenarios.find(s => s.id === plan.scenarioId) || plan.riskCase.scenarios[0];

    const company = await db.company.findUnique({
        where: { id: companyId },
        include: {
            memoryThreads: { where: { agentType: "SIGNAL_RISK" } }
        }
    });

    // 2. Prompt the Reflection Agent
    const promptText = `
    You are the "Post-Analysis Reflection" Agent.
    Your job is to compare what an Autonomous Mitigation Agent PREDICTED versus what ACTUALLY happened, and extract durable playbook learnings for future incidents.
    
    ## Incident Context
    Trigger Type: ${plan.riskCase.triggerType}
    Details: ${JSON.stringify(plan.riskCase.entityMap)}
    Severity: ${plan.riskCase.severity}
    
    ## Predicted Mitigation Strategy (What we intended)
    Scenario Name: ${chosenScenario?.name || "Unknown"}
    Predicted Cost Delta: ${chosenScenario?.costDelta || "N/A"} (e.g. 1.15 = +15%)
    Predicted Service Impact: ${chosenScenario?.serviceImpact || "N/A"}
    
    ## Actual Real-World Outcome
    User Report: "${input.actualOutcomeText}"
    
    ## Task
    Analyze the delta between the prediction and the actual reality.
    1. Classify the "incidentClass" (e.g. "carrier_delay", "supplier_stockout").
    2. Extract numeric estimates for actual cost and service impact based on the user's text, or leave null if unknown.
    3. Score the effectiveness from 0.0 to 1.0.
    4. Provide 2-3 specific "learnings" (e.g. "Air freight estimators are currently underbidding by 10% on trans-pacific routes").
    
    Return your output strictly as JSON matching the requested schema. No markdown wrapping.
  `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptText,
        config: {
            responseMimeType: "application/json",
        }
    });

    if (!response.text) throw new Error("No response from generating reflection");
    const output: PlaybookEntryOutput = JSON.parse(response.text);

    // Ensure required Json fields are never undefined (Prisma rejects missing/undefined)
    const predictedOutcome =
        output.predictedOutcome && typeof output.predictedOutcome === "object"
            ? output.predictedOutcome
            : {
                  cost: typeof chosenScenario?.costDelta === "number" ? chosenScenario.costDelta : 0,
                  service: typeof chosenScenario?.serviceImpact === "number" ? chosenScenario.serviceImpact : 0,
              };
    const actualOutcome =
        output.actualOutcome && typeof output.actualOutcome === "object"
            ? output.actualOutcome
            : { cost: null, service: null, notes: "" };
    const effectiveness =
        output.effectiveness && typeof output.effectiveness === "object"
            ? output.effectiveness
            : { score: 0, verdict: "partial" as const };
    const learnings = Array.isArray(output.learnings) ? output.learnings : [];
    const incidentClass = typeof output.incidentClass === "string" && output.incidentClass.trim() ? output.incidentClass : "unknown";

    // 3. Save to Prisma Playbook
    const playbookEntry = await db.playbookEntry.create({
        data: {
            companyId,
            incidentClass,
            predictedOutcome,
            actualOutcome,
            effectiveness,
            learnings,
        }
    });

    // 4. Log the reflection learning back into the Backboard working memory
    const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
    const threadId = company?.memoryThreads[0]?.backboardThreadId;

    if (backboard.isConfigured() && threadId) {
        await backboard.appendReasoning(threadId, {
            action: "Reflection & Playbook Update Generated",
            incident: plan.riskCase.triggerType,
            effectivenessVerdict: effectiveness.verdict,
            learnings,
            systemNote: "These learnings have been permanently embedded in the active playbook."
        });
    }

    return {
        incidentClass,
        predictedOutcome,
        actualOutcome,
        effectiveness,
        learnings,
    };
}
