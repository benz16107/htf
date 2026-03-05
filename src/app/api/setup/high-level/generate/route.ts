import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
});

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

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session?.companyId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { stepIndex } = await request.json();

        if (stepIndex < 0 || stepIndex >= profileParts.length) {
            return NextResponse.json({ error: "Invalid step index" }, { status: 400 });
        }

        const partName = profileParts[stepIndex];

        // Fetch context
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

        const integrationNames = company.integrations.map((i) => i.provider);
        const integrationsList = integrationNames.join(", ");
        const simulatedContext = generateSimulatedContext(integrationNames);

        const promptText = `
    You are the AI Setup Agent building a High-Level Supply Chain Profile.
    
    Company Context:
    Name: ${company.name}
    Sector: ${company.baseProfile.sector}
    Type/Size: ${company.baseProfile.companyType}
    Base Supply Chain Summary: ${company.baseProfile.rawInput || company.baseProfile.generatedSummary}
    
    Connected integrations: ${integrationsList || "None"}
    Live System Context (simulated from integrations): 
    ${simulatedContext}
    
    Task:
    Analyze and generate the profile for: **${partName}**. Provide deep, specific analysis using the Live System Context provided above if relevant.
    
    Rules:
    1. Reason step-by-step how you inferred or determined these details based on the base profile AND the live system context.
    2. Provide a clear, professional summary.
    3. If there is insufficient data, explicitly state a warning.

    Provide your response in JSON format exactly matching these keys: "reasoning" (string), "summary" (string), "warning" (string - leave empty if there is enough data).
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
    } catch (error) {
        console.error(`AI High-Level Generation Error (Step):`, error);
        return NextResponse.json(
            { error: "Failed to run AI Setup Agent for this section" },
            { status: 500 }
        );
    }
}
