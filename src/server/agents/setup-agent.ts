import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

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
  const promptText = `
    You are the AI Setup Agent. Review these inputs:
    Company Name: ${input.companyName}
    Sector: ${input.sector}
    Type: ${input.companyType}
    Summary: ${input.supplyChainSummary}
    
    1. Create a professional, finalized summary of this company's supply chain graph.
    2. Document if there are any immediate missing pieces or warnings about the provided data.
    3. Provide your explicit reasoning traces of how you classified their supply chain structure.

    Provide your response in JSON format exactly matching these keys: "summary" (string), "warnings" (array of strings), "traces" (array of objects with "stepKey" and "rationale" strings).
  `;

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
