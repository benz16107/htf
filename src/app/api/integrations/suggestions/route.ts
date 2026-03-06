import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export type SuggestionsResponse = {
  /** Recommended Zapier app/integration names to enable for input context (e.g. Gmail, Slack). */
  inputContextSuggestions: string[];
  /** Recommended Zapier app/integration names to enable for execution (e.g. Gmail, Slack). */
  executionSuggestions: string[];
};

/**
 * GET /api/integrations/suggestions
 * Returns Gemini-powered suggestions for which Zapier integrations/apps to enable
 * in the embed (e.g. Gmail, Slack, Google Sheets). Based only on company profile,
 * so the user sees recommendations before connecting anything.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const company = await db.company.findUnique({
    where: { id: session.companyId },
    include: { baseProfile: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const companyContext = [
    company.name,
    company.baseProfile?.sector && `Sector: ${company.baseProfile.sector}`,
    company.baseProfile?.companyType && `Type: ${company.baseProfile.companyType}`,
    company.baseProfile?.generatedSummary &&
      `Profile: ${company.baseProfile.generatedSummary.slice(0, 800)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are an expert at recommending which Zapier apps/integrations a company should enable for supply chain risk and operations.

## Company context
${companyContext || "No profile yet."}

## Task
Recommend Zapier app/integration names that this company should enable in Zapier. Use common, well-known app names as they appear in Zapier (e.g. Gmail, Slack, Google Sheets, HubSpot, Salesforce, Airtable, Notion, Microsoft Outlook, Trello, Asana, Netsuite, Shopify, ShipStation, QuickBooks, Zendesk).

Return valid JSON only, no markdown.

1. **inputContextSuggestions**: Apps best for automatically retrieving context (read email, CRM/ERP data, orders, calendars). Pick 4–6 app names.

2. **executionSuggestions**: Apps best for taking action in mitigation plans (send email, create tickets, notify people, update records). Pick 4–6 app names.

Rules:
- Use only standard Zapier app names (as a user would search for them in Zapier).
- An app can appear in both arrays if it supports both reading and acting (e.g. Gmail).
- Consider the company's sector and profile. For supply chain, think: email, ERP, shipping, CRM, collaboration.

Return JSON in this exact shape:
{"inputContextSuggestions":["Gmail","Slack",...],"executionSuggestions":["Gmail","Slack",...]}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text?.trim();
    if (!text) {
      return NextResponse.json({
        inputContextSuggestions: [],
        executionSuggestions: [],
        error: "No response from suggestions model",
      });
    }

    const parsed = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.replace(/^.*?(\{[\s\S]*\}).*$/s, "$1"));
    const inputContextSuggestions = (parsed.inputContextSuggestions ?? [])
      .filter((name: unknown) => typeof name === "string" && name.trim().length > 0)
      .map((name: string) => name.trim());
    const executionSuggestions = (parsed.executionSuggestions ?? [])
      .filter((name: unknown) => typeof name === "string" && name.trim().length > 0)
      .map((name: string) => name.trim());

    return NextResponse.json({
      inputContextSuggestions,
      executionSuggestions,
    } satisfies SuggestionsResponse);
  } catch (e) {
    console.error("Integrations suggestions Gemini error", e);
    return NextResponse.json(
      {
        inputContextSuggestions: [],
        executionSuggestions: [],
        error: e instanceof Error ? e.message : "Failed to generate suggestions",
      },
      { status: 500 }
    );
  }
}
