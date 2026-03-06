import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "@/server/zapier/mcp-config";

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

const MAX_LIVE_CONTEXT_CHARS = 6000;

function isReadOnlyTool(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    const readPatterns = ["find", "search", "list", "get", "fetch", "read", "retrieve"];
    const actionPatterns = ["reply", "send", "remove", "add", "create", "update", "delete", "mark", "move", "label"];
    if (actionPatterns.some((a) => lower.includes(a))) return false;
    return readPatterns.some((r) => lower.includes(r));
}

function getProfileContextArgs(toolName: string): Record<string, unknown> {
    const lower = toolName.toLowerCase();
    let instructions = "Return up to 15 recent items that could inform supply chain, risk, or operations (e.g. orders, suppliers, shipments, meetings). Include subject/title and key details.";
    if (lower.includes("gmail") && (lower.includes("find") || lower.includes("search"))) {
        instructions = "Get my 15 most recent emails from inbox that might relate to suppliers, orders, or logistics. Return subject, sender, and a short snippet.";
    } else if (lower.includes("outlook") || lower.includes("microsoft")) {
        instructions = "Get my 15 most recent emails that could relate to supply chain or operations. Return subject and snippet.";
    } else if (lower.includes("slack")) {
        instructions = "Return up to 15 recent messages or threads that might relate to operations, suppliers, or risk. Include channel and summary.";
    } else if (lower.includes("calendar")) {
        instructions = "Return up to 15 upcoming or recent calendar events that might relate to supply chain or vendor meetings.";
    } else if (lower.includes("drive") || lower.includes("sheet")) {
        instructions = "List or summarize up to 15 recent items (files, rows) that could inform supply chain or operations.";
    } else if (lower.includes("crm") || lower.includes("salesforce") || lower.includes("hubspot")) {
        instructions = "Return up to 15 recent records or activities that could inform customer demand, orders, or supply chain.";
    }
    return { instructions, limit: 15, max_results: 15, maxResults: 15 };
}

function summarizeContentItem(item: unknown): string | null {
    let raw: string | null = null;
    if (item && typeof item === "object" && "text" in item && typeof (item as { text: unknown }).text === "string") {
        raw = (item as { text: string }).text.trim();
    } else if (typeof item === "string") {
        raw = item.trim();
    }
    if (!raw || raw.length < 2) return null;
    if (raw.startsWith("{") && (raw.includes("followUpQuestion") || raw.includes("isPreview"))) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const arr = (parsed.results ?? parsed.data ?? parsed.items ?? parsed.emails) as unknown[] | undefined;
        if (Array.isArray(arr) && arr.length > 0) {
            const lines: string[] = [];
            for (const it of arr.slice(0, 10)) {
                if (it && typeof it === "object") {
                    const o = it as Record<string, unknown>;
                    const subj = typeof o.subject === "string" ? o.subject : typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : undefined;
                    const from = o.from && typeof o.from === "object" ? String((o.from as { email?: string }).email ?? (o.from as { name?: string }).name ?? "") : undefined;
                    if (subj) lines.push(from ? `"${subj.slice(0, 60)}" from ${from}` : subj.slice(0, 80));
                    else lines.push(JSON.stringify(o).slice(0, 80));
                }
            }
            return lines.join(" · ");
        }
        const subj = parsed.subject ?? parsed.title ?? parsed.name;
        if (typeof subj === "string") return subj.slice(0, 200);
    } catch {
        // not JSON
    }
    return raw.slice(0, 300);
}

async function fetchLiveContextFromZapier(companyId: string): Promise<string> {
    const config = await getZapierMCPConfigForCompany(companyId);
    const toolSelections = await getZapierMCPToolSelections(companyId);
    const inputTools = toolSelections.inputContextTools ?? [];
    if (!config || inputTools.length === 0) return "";

    const readOnly = inputTools.filter((t) => isReadOnlyTool(t));
    if (readOnly.length === 0) return "";

    const parts: string[] = [];
    let totalChars = 0;

    for (const toolName of readOnly) {
        if (totalChars >= MAX_LIVE_CONTEXT_CHARS) break;
        try {
            const args = getProfileContextArgs(toolName);
            const result = await callZapierMCPTool(config, toolName, args);
            if (result.isError || !result.content?.length) continue;

            const source = toolName.split(":")[0]?.trim() || toolName;
            const lines: string[] = [];
            for (const item of result.content) {
                const sum = summarizeContentItem(item);
                if (sum) lines.push(sum);
            }
            if (lines.length > 0) {
                const block = `[${source}]\n${lines.join("\n")}`;
                const take = Math.min(block.length, MAX_LIVE_CONTEXT_CHARS - totalChars - 50);
                if (take > 0) {
                    parts.push(block.slice(0, take));
                    totalChars += take;
                }
            }
        } catch (err) {
            console.error(`High-level profile: Zapier fetch failed for ${toolName}:`, err);
        }
    }

    return parts.length > 0 ? parts.join("\n\n") : "";
}

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

        const liveDataFromZapier = await fetchLiveContextFromZapier(session.companyId);
        const simulatedContext = generateSimulatedContext(integrationNames);
        const liveSystemContextBlock = liveDataFromZapier
            ? `Live data retrieved from your connected apps (Zapier — use this when relevant to each dimension):\n${liveDataFromZapier}\n\nAdditional context from connected integrations (if no live data above, use as reference):\n${simulatedContext}`
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
Analyze and generate the profile for ALL of the following dimensions in one pass. Use the company context and the live data / system context above. When live data from Zapier is present, use it to inform risk, lead times, SLAs, and operations where relevant. For each dimension provide deep, specific analysis.

Dimensions to analyze:
${sectionsList}

Rules:
1. For each dimension, reason step-by-step how you inferred or determined the details based on the base profile AND the live data / system context above.
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
Analyze and generate the profile for: **${profileParts[stepIndex!]}**. Provide deep, specific analysis using the live data and system context above when relevant.

Rules:
1. Reason step-by-step how you inferred or determined these details based on the base profile AND the live system context.
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
