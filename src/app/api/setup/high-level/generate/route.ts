import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import { fetchLiveContextFromZapier, DEFAULT_MAX_LIVE_CONTEXT_CHARS } from "@/server/zapier/live-context";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

const profileParts = [
    "Existing risk classification and supplier health scoring",
    "Lead-time sensitivity",
    "Inventory buffer policies",
    "Contract structures",
    "Customer SLA profile",
    "ERP signal monitoring",
];

function generateSimulatedContext(integrations: string[]): string {
    if (!integrations || integrations.length === 0) return "No live system data available.";

    const contextParts: string[] = [];

    if (integrations.includes("Shopify")) {
        contextParts.push(`Shopify Data:
- Recent Order Volume: 1,240 orders/week (Trending +15%)
- Top Selling SKUs: SKU-1092, SKU-4421
- Customer SLA: 98% On-Time Delivery for 2-day shipping`);
    }

    if (integrations.includes("Netsuite")) {
        contextParts.push(`Netsuite (ERP) Data:
- Active Suppliers: 14 Primary, 32 Secondary
- Average Supplier Lead Time: 45 days (Variance: +/- 12 days)
- Inventory Buffers: 21 days of supply across primary warehouse
- Open POs: 45 units pending from APAC region`);
    }

    if (integrations.includes("ShipStation") || integrations.includes("Shippo")) {
        contextParts.push(`Shipping/Logistics Data:
- Carrier Split: FedEx (60%), UPS (30%), USPS (10%)
- Average Fulfillment Time: 1.4 days
- Current Transit Delays: 4% of active shipments impacted by weather in Midwest`);
    }

    if (integrations.includes("Email") || integrations.includes("Slack")) {
        contextParts.push(`Communication Signals (Email/Slack):
- Recent flags: "Supplier factory maintenance scheduled for next month"
- Vendor Sentiment: Neutral to positive, 1 escalation in last 30 days.`);
    }

    if (contextParts.length === 0) {
        return "Connected systems do not currently have rich supply chain context loaded.";
    }

    return contextParts.join("\n\n");
}

/** Expected JSON: { "0": { reasoning, summary, warning }, "1": { ... }, ... } */
type AllSectionsResponse = Record<string, { reasoning: string; summary: string; warning: string }>;

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const stepIndex = body.stepIndex as number | undefined;
        const generateAll = stepIndex === undefined || stepIndex === null;

        if (!generateAll && (stepIndex < 0 || stepIndex >= profileParts.length)) {
            return NextResponse.json({ error: "Invalid step index" }, { status: 400 });
        }

        const company = await db.company.findUnique({
            where: { id: session.companyId },
            include: {
                baseProfile: true,
                integrations: true,
            },
        });

        if (!company || !company.baseProfile) {
            return NextResponse.json({ error: "Company base profile not found" }, { status: 404 });
        }

        const toolSelections = await getZapierMCPToolSelections(session.companyId);
        const integrationNames = [...new Set([...toolSelections.inputContextTools, ...toolSelections.executionTools])];
        const integrationsList = integrationNames.length > 0 ? integrationNames.join(", ") : "None";

        const liveDataFromZapier = await fetchLiveContextFromZapier(session.companyId, DEFAULT_MAX_LIVE_CONTEXT_CHARS);
        const simulatedContext = generateSimulatedContext(integrationNames);
        const mcpIntegrationNote =
          integrationNames.length > 0
            ? `Your company has MCP-connected integrations available as data sources: ${integrationNames.join(", ")}. The live data below was retrieved from these; each block is labeled by source (e.g. [Gmail], [Google Sheets]).`
            : "";
        const liveSystemContextBlock = liveDataFromZapier
            ? `${mcpIntegrationNote ? mcpIntegrationNote + "\n\n" : ""}Live data from MCP integrations (use only what is relevant to each dimension):\n${liveDataFromZapier}\n\nAdditional context from connected integrations (if no live data above, use as reference):\n${simulatedContext}`
            : `Live System Context (simulated from integrations):\n${simulatedContext}`;

        const sectionsList = profileParts.map((p, i) => `${i}. ${p}`).join("\n");

        const promptText = generateAll
            ? `
You are the AI Setup Agent building a High-Level Supply Chain Profile.

Company Context:
Name: ${company.name}
Sector: ${company.baseProfile.sector}
Type/Size: ${company.baseProfile.companyType}
Base Supply Chain Summary: ${company.baseProfile.rawInput || company.baseProfile.generatedSummary}

Connected integrations: ${integrationsList || "None"}
${liveSystemContextBlock}

Task:
Analyze and generate the profile for ALL of the following dimensions in one pass. All integrations above are connected via MCP; the live data was pulled from them. For each dimension: (1) reason which MCP sources (e.g. Gmail, Google Sheets, Slack) are relevant to that dimension, (2) identify the specific excerpts in the live data that apply, and (3) use only those to inform your analysis. Ignore irrelevant data. If no live data is relevant to a dimension, use the base profile and simulated context.

Dimensions to analyze:
${sectionsList}

Rules:
1. For each dimension, reason step-by-step: which connected services are relevant, which parts of the live data you used, and how you inferred the details. Base your summary only on relevant evidence.
2. Provide a clear, professional summary per dimension.
3. If there is insufficient data for a dimension, set "warning" to a short message; otherwise leave "warning" empty.

Respond with a single JSON object. Keys must be the dimension indices as strings: "0", "1", "2", "3", "4", "5".
Each value must be an object with exactly: "reasoning" (string), "summary" (string), "warning" (string).
Example shape: { "0": { "reasoning": "...", "summary": "...", "warning": "" }, "1": { ... }, ... }
`
            : `
You are the AI Setup Agent building a High-Level Supply Chain Profile.

Company Context:
Name: ${company.name}
Sector: ${company.baseProfile.sector}
Type/Size: ${company.baseProfile.companyType}
Base Supply Chain Summary: ${company.baseProfile.rawInput || company.baseProfile.generatedSummary}

Connected integrations: ${integrationsList || "None"}
${liveSystemContextBlock}

Task:
Analyze and generate the profile for: **${profileParts[stepIndex!]}**. The live data above comes from your MCP-connected integrations. Reason which source(s) and which excerpts are relevant to this dimension; use only those. If none are relevant, use the base profile and simulated context.

Rules:
1. Reason step-by-step: which integration(s) and which parts of the live data are relevant; how you inferred the details from that evidence.
2. Provide a clear, professional summary.
3. If there is insufficient data, explicitly state a warning.

Provide your response in JSON format exactly matching these keys: "reasoning" (string), "summary" (string), "warning" (string - leave empty if there is enough data).
`;

        let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: promptText,
                    config: {
                        responseMimeType: "application/json",
                    },
                });
                break;
            } catch (e) {
                const status = (e as { status?: number })?.status;
                const isRetryable = status === 503 || status === 429 || (e instanceof Error && e.message?.includes("UNAVAILABLE"));
                if (attempt < MAX_RETRIES && isRetryable) {
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    continue;
                }
                throw e;
            }
        }

        if (!response?.text) throw new Error("No response text");
        const object = JSON.parse(response.text) as AllSectionsResponse | { reasoning: string; summary: string; warning: string };

        if (generateAll) {
            const sections = object as AllSectionsResponse;
            const normalized: Record<number, { reasoning: string; summary: string; warning: string }> = {};
            for (let i = 0; i < profileParts.length; i++) {
                const key = String(i);
                const s = sections[key] ?? (object as { reasoning?: string; summary?: string; warning?: string });
                normalized[i] = {
                    reasoning: s?.reasoning ?? "",
                    summary: s?.summary ?? "",
                    warning: s?.warning ?? "",
                };
            }
            return NextResponse.json(normalized);
        }

        return NextResponse.json(object);
    } catch (error) {
        console.error(`AI High-Level Generation Error:`, error);
        const status = (error as { status?: number })?.status;
        const isUnavailable = status === 503 || (error instanceof Error && error.message?.includes("UNAVAILABLE"));
        const message = isUnavailable
            ? "AI service is temporarily unavailable. Please try again in a moment."
            : "Failed to run AI Setup Agent for this section";
        return NextResponse.json(
            { error: message },
            { status: isUnavailable ? 503 : 500 }
        );
    }
}
