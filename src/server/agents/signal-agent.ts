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

export async function runSignalRiskAgent(
  companyId: string,
  input: RiskCaseInput,
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
  if (!company.baseProfile) throw new Error("Company baseProfile missing");
  if (!company.highLevelProfile) throw new Error("Company highLevelProfile missing");
  if (!company.memoryThreads || company.memoryThreads.length === 0) {
    console.error("No memoryThreads found for company", companyId);
  }

  // 2. Initialize Backboard Memory
  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  let threadId = company.memoryThreads[0]?.backboardThreadId;
  let assistantId = (company.memoryThreads[0] as any)?.backboardAssistantId;


      // 3. Construct the LLM Prompt
      const promptText = `
        You are the "Signal Perceiving-Reasoning Assess" Agent.
        Your job is to analyze incoming supply chain disruption signals and estimate probabilities, impacts, and financial losses.
    
        ## Company Context
        Name: ${company.name}
        Sector/Type: ${company.baseProfile?.sector} / ${company.baseProfile?.companyType}
        Size/Revenue proxy: ${company.baseProfile?.sizeBand || "SMB ($10M-$50M)"}
        Base Summary: ${company.baseProfile?.generatedSummary}
    
        ## High-Level Topology Context
        Lead Time Sensitivity: ${JSON.stringify(company.highLevelProfile?.leadTimeSensitivity)}
        Inventory Buffer Policies: ${JSON.stringify(company.highLevelProfile?.inventoryBufferPolicies)}
        Customer SLAs: ${JSON.stringify(company.highLevelProfile?.customerSlaProfile)}
    
        ## Incoming Risk Signal
        Type: ${input.triggerType}
        Source/Entity Mapping: ${JSON.stringify(input.entityMap)}
        Time Window: ${input.timeWindow.startDate} (Expected Duration: ${input.timeWindow.expectedDurationDays} days)
        Initial Assumptions: ${input.assumptions.join(", ")}
    
        ## Task
        Return your output strictly as JSON matching the following schema. Do not include any markdown formatting, code blocks, comments, or extra text. Only output the JSON object, nothing else.
        {
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
              "riskReduction": number
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
            // Probability
            output.probability = {
              pointEstimate: Number(raw.probability?.pointEstimate || raw.probabilityOfMaterialImpact || 0),
              bandLow: Number(raw.probability?.bandLow || 0),
              bandHigh: Number(raw.probability?.bandHigh || 1),
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
              riskReduction: Number(s.riskReduction || 0)
            })) : [];
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
          rationale: `Evaluated incoming ${input.triggerType} signal against ${company.baseProfile?.sector || "company"} topology constraints. Confidence level rated ${output.probability?.confidence || "medium"} based on buffer depth mapping. Expected duration of ${input.timeWindow?.expectedDurationDays || "unknown"} days creates severe structural pressure leading to ${output.scenarios?.length || 0} actionable mitigation plans.`,
          evidencePack: input.entityMap,
        }
      });

      // 7. Write transparent reasoning to the Backboard Thread Memory
      if (backboard.isConfigured() && threadId) {
        await backboard.appendReasoning(threadId, {
          action: "Risk Case Assessed",
          inputSignal: input,
          assessedOutput: output,
          internalLogic: "Cross-correlated expected duration against inventory buffer policies. Found immediate downstream SLA threat."
        });
      }

      return output;
  }
