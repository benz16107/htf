import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { buildSetupPrompt } from "./prompts";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export type SetupAgentInput = {
  companyName: string;
  sector: string;
  companyType: string;
  supplyChainSummary: string;
};

export type SetupAgentResult = {
  summary: string;
  warnings: string[];
  traces: Array<{
    stepKey: string;
    rationale: string;
  }>;
};

export async function runSetupAgent(input: SetupAgentInput): Promise<SetupAgentResult> {
  const promptText = buildSetupPrompt({
    companyName: input.companyName,
    sector: input.sector,
    companyType: input.companyType,
    supplyChainSummary: input.supplyChainSummary,
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
      }
    });

    if (!response.text) throw new Error("No response text");
    const object = JSON.parse(response.text) as SetupAgentResult;
    return object;
  } catch (error) {
    console.error("AI Setup Agent execution failed:", error);
    // Fallback if AI fails so we don't break the user's flow
    return {
      summary: `Setup summary prepared for ${input.companyName} (${input.sector}).`,
      warnings: ["AI analysis failed. Returning base data."],
      traces: [
        {
          stepKey: "baselayer_classification",
          rationale: "Classified sector and company type using user-provided values.",
        },
      ],
    };
  }
}
