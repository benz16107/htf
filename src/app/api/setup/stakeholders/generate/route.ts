import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseSupplyChainLinks } from "@/lib/supply-chain-links";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { prompt } = (await request.json()) as { prompt?: string };
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      include: { baseProfile: true },
    });

    const promptText = `
You are an expert in supply-chain mapping.

Company Name: ${company?.name || "Unknown"}
Sector: ${company?.baseProfile?.sector || "Unknown"}
Company Type: ${company?.baseProfile?.companyType || "Unknown"}
Supply Chain Summary: ${company?.baseProfile?.generatedSummary || company?.baseProfile?.rawInput || "Unknown"}
Additional User Prompt: ${prompt?.trim() || "None"}

Return a JSON object with this exact shape:
{
  "links": [
    {
      "name": "string",
      "type": "supplier | manufacturer | delivery partner | warehouse | distributor | retailer | 3PL | customer | regulator | process",
      "purpose": "string",
      "connections": "string",
      "process": "string",
      "location": "string",
      "criticality": "high | medium | low",
      "notes": "string"
    }
  ]
}

Requirements:
- Return 5-10 practical links.
- Include at least one upstream, one internal process, and one downstream link when possible.
- Keep each field concise and specific.
- Use empty string for unknown optional fields.
- Only return JSON.
`;

    const model = await getGeminiModelForCompany(session.companyId);
    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        responseMimeType: "application/json",
      },
    });

    if (!response.text) throw new Error("No response text");
    const parsed = JSON.parse(response.text) as { links?: unknown };
    const links = parseSupplyChainLinks({ links: parsed.links });

    return NextResponse.json({ links });
  } catch (error: unknown) {
    console.error("Stakeholder generation error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Failed to generate supply chain links" },
      { status: 500 },
    );
  }
}
