import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/lib/db";
import { BackboardClient } from "../memory/backboard-client";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export type RiskCaseInput = {
  triggerType: string;
  entityMap: Record<string, string>;
  timeWindow: {
    startDate: string;
    expectedDurationDays: number;
  };
  assumptions: string[];
};

export type RiskCaseOutput = {
  probability: {
    pointEstimate: number;
    bandLow: number;
    bandHigh: number;
    confidence: "low" | "medium" | "high";
    topDrivers: string[];
  };
  impact: {
    severity: "minor" | "moderate" | "severe" | "critical";
    timelineWeeks: number;
    affectedAreas: string[];
  };
  financialImpact: {
    revenueAtRiskUsd: number;
    hardCostIncreaseUsd: number;
    marginErosionPercent: number;
  };
  scenarios: Array<{
    name: string;
    recommendation: "recommended" | "fallback" | "alternate";
    costDelta: number;
    serviceImpact: number;
    riskReduction: number;
  }>;
  warning?: string;
};

export type RunSignalRiskOptions = {
  /** When false, returns assessment only and does not create RiskCase/Scenarios. Default true. */
  createRiskCase?: boolean;
};

export async function runSignalRiskAgent(
  companyId: string,
  input: RiskCaseInput,
  options?: RunSignalRiskOptions,
): Promise<RiskCaseOutput> {
  // 1. Fetch Company Context
  const company = await db.company.findUnique({
    where: { id: companyId },
    include: {
      baseProfile: true,
      highLevelProfile: true,
      memoryThreads: {
        where: { agentType: "SIGNAL_RISK" }
      }
    }
  });

  if (!company) throw new Error("Company not found");

  const baseProfile = company.baseProfile ?? undefined;
  const highLevelProfile = company.highLevelProfile ?? undefined;
  if (!company.memoryThreads || company.memoryThreads.length === 0) {
    console.error("No memoryThreads found for company", companyId);
  }

  // 2. Initialize Backboard Memory
  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  let threadId = company.memoryThreads[0]?.backboardThreadId;
  let assistantId = (company.memoryThreads[0] as any)?.backboardAssistantId;

  const entityMapStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.entityMap || {})) {
    entityMapStrings[k] = typeof v === "string" ? v : JSON.stringify(v ?? "");
  }
  const safeInput = { ...input, entityMap: entityMapStrings };

      // 3. Construct the LLM Prompt
      const promptText = `
        You are the "Signal Perceiving-Reasoning Assess" Agent.
        Your job is to analyze incoming supply chain disruption signals and estimate probabilities, impacts, and financial losses.
    
        ## Company Context
        Name: ${company.name}
        Sector/Type: ${baseProfile?.sector ?? "General"} / ${baseProfile?.companyType ?? "Business"}
        Size/Revenue proxy: ${baseProfile?.sizeBand ?? "SMB ($10M-$50M)"}
        Base Summary: ${baseProfile?.generatedSummary ?? "No detailed profile yet. Proceed with general supply chain assumptions."}
    
        ## High-Level Topology Context
        Lead Time Sensitivity: ${JSON.stringify(highLevelProfile?.leadTimeSensitivity ?? {})}
        Inventory Buffer Policies: ${JSON.stringify(highLevelProfile?.inventoryBufferPolicies ?? {})}
        Customer SLAs: ${JSON.stringify(highLevelProfile?.customerSlaProfile ?? {})}
    
        ## Incoming Risk Signal
        Type: ${safeInput.triggerType}
        Source/Entity Mapping: ${JSON.stringify(safeInput.entityMap)}
        Time Window: ${safeInput.timeWindow.startDate} (Expected Duration: ${safeInput.timeWindow.expectedDurationDays} days)
        Initial Assumptions: ${(safeInput.assumptions || []).join(", ")}
    
        ## Task
        Summarize the risk in one short phrase (e.g. "Supplier delay risk", "Port disruption – Asia routes") as "issueTitle". For each scenario, include "plannedTasks": an array of 3–6 items. Each item must have "task" (short description) and "executionType" (one of: "email", "notification", "summary", "insight", "recommendation", "zapier_mcp", "api", "webhook").
        You MUST also provide exact, detailed reasoning for every number and result. In "reasoning", explain in plain language: (1) why you chose this probability and confidence, citing specific signals or evidence; (2) why you chose this severity and timeline, and which affected areas drive it; (3) how you derived revenue at risk and margin erosion (e.g. which assumptions, which revenue base, which cost drivers). Be specific—reference the input signals and company context. Then return your output strictly as JSON matching the following schema. Do not include any markdown formatting, code blocks, comments, or extra text. Only output the JSON object, nothing else.
        {
          "issueTitle": string,
          "reasoning": {
            "probability": string,
            "impact": string,
            "financialImpact": string
          },
          "probability": {
            "pointEstimate": number,
            "bandLow": number,
            "bandHigh": number,
            "confidence": "low" | "medium" | "high",
            "topDrivers": string[]
          },
          "impact": {
            "severity": "minor" | "moderate" | "severe" | "critical",
            "timelineWeeks": number,
            "affectedAreas": string[]
          },
          "financialImpact": {
            "revenueAtRiskUsd": number,
            "hardCostIncreaseUsd": number,
            "marginErosionPercent": number
          },
          "scenarios": [
            {
              "name": string,
              "recommendation": "recommended" | "fallback" | "alternate",
              "costDelta": number,
              "serviceImpact": number,
              "riskReduction": number,
              "plannedTasks": [{"task": string, "executionType": string}]
            }
          ]
        }
      `;

      // 4. Generate Reasoning & Analysis
      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: promptText,
          config: { responseMimeType: "application/json" }
        });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.error("Gemini API call timed out");
          throw new Error("Gemini API call timed out (30s)");
        }
        console.error("Gemini API error:", err);
        throw new Error("Gemini API call failed: " + (err?.message || err));
      }

      // 5. Robust parsing and schema mapping
      let output: any;
      try {
        output = JSON.parse(response.text ?? "{}");
      } catch (err: any) {
        // Try to clean up and parse again
        let cleaned = (response.text ?? "{}").replace(/,\s*([}\]])/g, '$1').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
        try {
          output = JSON.parse(cleaned);
        } catch (err2: any) {
          // Fallback: manually coerce fields
          try {
            const raw = JSON.parse(response.text ?? "{}");
            output = {};
            // Reasoning
            const rawReason = raw.reasoning;
            output.reasoning = rawReason && typeof rawReason === "object"
              ? {
                  probability: String(rawReason.probability ?? ""),
                  impact: String(rawReason.impact ?? ""),
                  financialImpact: String(rawReason.financialImpact ?? ""),
                }
              : { probability: "", impact: "", financialImpact: "" };
            // Probability
            const pe = Number(raw.probability?.pointEstimate ?? raw.probabilityOfMaterialImpact ?? 0);
            const bl = Number(raw.probability?.bandLow ?? 0);
            const bh = Number(raw.probability?.bandHigh ?? 1);
            const scale = [pe, bl, bh].some((n) => n > 1) ? 100 : 1;
            output.probability = {
              pointEstimate: scale === 100 ? Math.min(100, Math.max(0, pe)) / 100 : pe,
              bandLow: scale === 100 ? Math.min(100, Math.max(0, bl)) / 100 : bl,
              bandHigh: scale === 100 ? Math.min(100, Math.max(0, bh)) / 100 : bh,
              confidence: String(raw.probability?.confidence || raw.severity || 'medium').toLowerCase(),
              topDrivers: Array.isArray(raw.probability?.topDrivers) ? raw.probability.topDrivers : []
            };
            // Impact
            output.impact = {
              severity: String(raw.impact?.severity || raw.severity || 'moderate').toLowerCase(),
              timelineWeeks: Number(raw.impact?.timelineWeeks || 1),
              affectedAreas: Array.isArray(raw.impact?.affectedAreas) ? raw.impact.affectedAreas : []
            };
            // Financial Impact
            output.financialImpact = {
              revenueAtRiskUsd: Number(raw.financialImpact?.revenueAtRiskUsd || 0),
              hardCostIncreaseUsd: Number(raw.financialImpact?.hardCostIncreaseUsd || 0),
              marginErosionPercent: Number(raw.financialImpact?.marginErosionPercent || 0)
            };
            // Scenarios
            output.scenarios = Array.isArray(raw.scenarios) ? raw.scenarios.map((s: any) => ({
              name: String(s.name || ''),
              recommendation: String(s.recommendation || 'fallback'),
              costDelta: Number(s.costDelta || 0),
              serviceImpact: Number(s.serviceImpact || 0),
              riskReduction: Number(s.riskReduction || 0),
              plannedTasks: Array.isArray(s.plannedTasks) ? s.plannedTasks.map((t: any) =>
                typeof t === 'object' && t != null && (t.task != null || t.task === '')
                  ? { task: String(t.task ?? ''), executionType: String(t.executionType ?? 'other') }
                  : { task: String(t ?? ''), executionType: 'other' }
              ) : []
            })) : [];
            const rawTitle = String(raw.issueTitle || '').trim();
            if (rawTitle) output.issueTitle = rawTitle;
          } catch (err3: any) {
            console.error("Failed to coerce Gemini response:", response.text);
            // Final fallback
            output = {
              probability: {
                pointEstimate: 0,
                bandLow: 0,
                bandHigh: 1,
                confidence: 'low',
                topDrivers: ['Gemini output could not be parsed']
              },
              impact: {
                severity: 'unknown',
                timelineWeeks: 0,
                affectedAreas: []
              },
              financialImpact: {},
              scenarios: [],
              warning: 'Gemini output could not be parsed. See logs for details.'
            };
          }
        }
      }
      const parsedTitle = String(output?.issueTitle ?? '').trim();
      if (parsedTitle) output.issueTitle = parsedTitle;

      // Ensure reasoning object exists (first parse may have it)
      if (!output.reasoning || typeof output.reasoning !== "object") {
        const r = output.reasoning as any;
        output.reasoning = {
          probability: (r?.probability != null ? String(r.probability) : "") || "",
          impact: (r?.impact != null ? String(r.impact) : "") || "",
          financialImpact: (r?.financialImpact != null ? String(r.financialImpact) : "") || "",
        };
      }

      // Normalize probability to 0–1 scale (LLM may return 0–100)
      if (output.probability && typeof output.probability === "object") {
        const p = output.probability as { pointEstimate?: number; bandLow?: number; bandHigh?: number };
        const scale = [p.pointEstimate, p.bandLow, p.bandHigh].some((n) => typeof n === "number" && n > 1)
          ? 100
          : 1;
        if (scale === 100) {
          if (typeof p.pointEstimate === "number") p.pointEstimate = Math.min(100, Math.max(0, p.pointEstimate)) / 100;
          if (typeof p.bandLow === "number") p.bandLow = Math.min(100, Math.max(0, p.bandLow)) / 100;
          if (typeof p.bandHigh === "number") p.bandHigh = Math.min(100, Math.max(0, p.bandHigh)) / 100;
        }
      }

      // Normalize plannedTasks to { task, executionType }[]
      if (Array.isArray(output?.scenarios)) {
        output.scenarios = output.scenarios.map((s: any) => {
          const raw = Array.isArray(s.plannedTasks) ? s.plannedTasks : [];
          const plannedTasks = raw.map((t: any) =>
            typeof t === "object" && t != null && "task" in t
              ? { task: String(t.task ?? ""), executionType: String(t.executionType ?? "other") }
              : { task: String(t ?? ""), executionType: "other" }
          );
          return { ...s, plannedTasks };
        });
      }

      // 6. Create Agent Session & Logging
      const session = await db.agentSession.create({
        data: {
          companyId,
          agentType: "SIGNAL_RISK",
          status: "COMPLETED",
        }
      });

      await db.reasoningTrace.create({
        data: {
          companyId,
          sessionId: session.id,
          stepKey: "signal_triage_assessment",
          stepTitle: "Risk Signal Probability & Impact Assessment",
          rationale: `Evaluated incoming ${safeInput.triggerType} signal against ${baseProfile?.sector || "company"} topology constraints. Confidence level rated ${output.probability?.confidence || "medium"} based on buffer depth mapping. Expected duration of ${safeInput.timeWindow?.expectedDurationDays || "unknown"} days creates severe structural pressure leading to ${output.scenarios?.length || 0} actionable mitigation plans.`,
          evidencePack: safeInput.entityMap,
        }
      });

      if (options?.createRiskCase !== false) {
      const severityMap: Record<string, "MINOR" | "MODERATE" | "SEVERE" | "CRITICAL"> = {
        minor: "MINOR",
        moderate: "MODERATE",
        severe: "SEVERE",
        critical: "CRITICAL",
      };
      const recMap: Record<string, "RECOMMENDED" | "FALLBACK" | "ALTERNATE"> = {
        recommended: "RECOMMENDED",
        fallback: "FALLBACK",
        alternate: "ALTERNATE",
      };

      const riskCase = await db.riskCase.create({
        data: {
          companyId,
          sessionId: session.id,
          triggerType: safeInput.triggerType,
          entityMap: safeInput.entityMap as object,
          timeWindow: safeInput.timeWindow as object,
          evidencePack: safeInput.entityMap as object,
          assumptions: (safeInput.assumptions || []) as object,
          constraints: {},
          probabilityPoint: output.probability?.pointEstimate ?? undefined,
          probabilityBandLow: output.probability?.bandLow ?? undefined,
          probabilityBandHigh: output.probability?.bandHigh ?? undefined,
          confidenceLevel: output.probability?.confidence ?? undefined,
          keyDrivers: Array.isArray(output.probability?.topDrivers) && output.probability.topDrivers.length > 0
            ? output.probability.topDrivers
            : undefined,
          severity: severityMap[String(output.impact?.severity || "moderate").toLowerCase()] ?? "MODERATE",
          serviceImpact: output.impact as object,
          financialImpact: output.financialImpact as object,
        },
      });

      for (const s of output.scenarios || []) {
        const plannedTasks = Array.isArray(s.plannedTasks) ? s.plannedTasks : [];
        await db.scenario.create({
          data: {
            riskCaseId: riskCase.id,
            name: String(s.name || "Scenario"),
            recommendation: recMap[String(s.recommendation || "fallback").toLowerCase()] ?? "FALLBACK",
            costDelta: typeof s.costDelta === "number" ? s.costDelta : undefined,
            serviceImpact: typeof s.serviceImpact === "number" ? s.serviceImpact : undefined,
            riskReduction: typeof s.riskReduction === "number" ? s.riskReduction : undefined,
            planOutline: plannedTasks.length > 0 ? plannedTasks : undefined,
            confidenceLevel: undefined,
            assumptions: undefined,
          },
        });
      }
      }

      // 7. Write transparent reasoning to the Backboard Thread Memory
      if (backboard.isConfigured() && threadId) {
        await backboard.appendReasoning(threadId, {
          action: "Risk Case Assessed",
          inputSignal: safeInput,
          assessedOutput: output,
          internalLogic: "Cross-correlated expected duration against inventory buffer policies. Found immediate downstream SLA threat."
        });
      }

      return output;
  }
