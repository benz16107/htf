import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { companyName, manualInput } = body;

        if (!companyName && !manualInput) {
            return NextResponse.json(
                { error: "Missing companyName or manualInput" },
                { status: 400 }
            );
        }

        const promptText = `
    Analyze the following company information to determine its supply chain profile.
    
    Company Name: ${companyName || "Unknown"}
    ${manualInput ? `Additional Information Provided by User: ${manualInput}` : ""}

    Your logic reasoning:
    1. If a known public company, use public info to infer its sector, type, size, industry stance, and supply chain.
    2. If unknown but a paragraph is provided, analyze the paragraph.
    3. Categorize sector, company type, size band.
    4. Provide a summarized description of the supply chain structure (suppliers, lanes, channels, plants).
    
    Provide your response in JSON format exactly matching these keys: "sector" (string), "companyType" (string), "sizeBand" (string), "industryStance" (string), "supplyChainSummary" (string).
    `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: promptText,
            config: {
                responseMimeType: "application/json",
            }
        });

        if (!response.text) throw new Error("No response text");
        const object = JSON.parse(response.text);

        return NextResponse.json(object);
    } catch (error: any) {
        console.error("AI Setup Error:", error?.message || error);
        return NextResponse.json(
            { error: "Failed to run AI Setup Agent" },
            { status: 500 }
        );
    }
}
