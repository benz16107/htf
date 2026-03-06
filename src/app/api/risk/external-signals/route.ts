import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export type ExternalSignalItem = {
  title: string;
  snippet: string;
  url?: string;
  source?: string;
};

export type SavedExternalSignalItem = ExternalSignalItem & {
  id: string;
  createdAt: string;
};

/**
 * GET /api/risk/external-signals
 * Returns saved external signals from the database for the current company.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.savedExternalSignal.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
  });

  const signals: SavedExternalSignalItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    url: r.url ?? undefined,
    source: r.source ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));

  const pulledAt =
    rows.length > 0 ? rows[0].createdAt.toISOString() : null;

  return NextResponse.json({ signals, pulledAt });
}

/**
 * DELETE /api/risk/external-signals
 * Deletes all saved external signals for the current company.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.savedExternalSignal.deleteMany({
    where: { companyId: session.companyId },
  });

  return NextResponse.json({ success: true });
}

function titleKey(title: string): string {
  return (title || "").toLowerCase().trim();
}

type CompanyContext = {
  name: string;
  sector?: string | null;
  companyType?: string | null;
  sizeBand?: string | null;
  generatedSummary?: string | null;
  rawInput?: string | null;
  supplyChainMap?: unknown;
  highLevelNarrative?: string | null;
};

function buildCompanyContextBlock(ctx: CompanyContext): string {
  const parts: string[] = [];
  parts.push(`Company: ${ctx.name}`);
  if (ctx.sector) parts.push(`Sector/Industry: ${ctx.sector}`);
  if (ctx.companyType) parts.push(`Type: ${ctx.companyType}`);
  if (ctx.sizeBand) parts.push(`Size: ${ctx.sizeBand}`);
  const summary = ctx.generatedSummary || ctx.rawInput;
  if (summary) parts.push(`Supply chain / business summary: ${summary.slice(0, 1200)}`);
  if (ctx.supplyChainMap && typeof ctx.supplyChainMap === "object") {
    const map = ctx.supplyChainMap as { summary?: string; regions?: string[]; suppliers?: string[] };
    if (map.summary) parts.push(`Supply chain map summary: ${String(map.summary).slice(0, 600)}`);
    if (Array.isArray(map.regions) && map.regions.length) parts.push(`Key regions: ${map.regions.join(", ")}`);
    if (Array.isArray(map.suppliers) && map.suppliers.length) parts.push(`Relevant supplier/category mentions: ${map.suppliers.join(", ")}`);
  }
  if (ctx.highLevelNarrative) parts.push(`Risk/operations context: ${ctx.highLevelNarrative.slice(0, 500)}`);
  return parts.join("\n");
}

async function pullFromWeb(companyContext: CompanyContext | null): Promise<ExternalSignalItem[]> {
  const contextBlock = companyContext
    ? `\n\nCRITICAL: Use this company profile. Return ONLY news that is clearly relevant to THIS company's sector, supply chain, regions, or suppliers. Exclude generic or tangentially related items. Prefer 4–6 highly relevant signals over many marginal ones.\n${buildCompanyContextBlock(companyContext)}\n\n`
    : "\n\nReturn only 4–6 items. Exclude generic filler; include only developments that are clearly relevant to supply chain risk (shipping, ports, suppliers, key regions, sector).\n\n";

  const prompt = `List recent news (last 7 days) that could affect supply chains. Types: shipping disruptions, port delays, natural disasters, supplier shortages, geopolitical conflicts, pandemics, cyberattacks, labor strikes. Return ONLY items that are clearly relevant to the request; do not pad with generic advice.${contextBlock}Return 4–6 signals maximum. For each provide a short title and a 1-2 sentence snippet. Return valid JSON only, no markdown, in this exact shape:
{"signals":[{"title":"...","snippet":"...","url":"optional url","source":"optional source name"}]}`;

  if (!process.env.GEMINI_API_KEY) {
    return placeholderSignals();
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text?.trim();
    if (!text) return placeholderSignals();

    const parsed = JSON.parse(text) as { signals?: ExternalSignalItem[] };
    return Array.isArray(parsed.signals) ? parsed.signals : placeholderSignals();
  } catch (err) {
    console.error("pullFromWeb error:", err);
    return placeholderSignals();
  }
}

function placeholderSignals(): ExternalSignalItem[] {
  return [
    { title: "Port congestion updates", snippet: "Major ports may experience delays; check carrier advisories.", source: "Placeholder" },
    { title: "Weather and natural disasters", snippet: "Monitor earthquakes, tsunamis, and severe weather in key shipping regions.", source: "Placeholder" },
    { title: "Geopolitical and trade", snippet: "Trade tensions and conflicts can affect routes and supplier availability.", source: "Placeholder" },
    { title: "Labor and strikes", snippet: "Labor strikes at ports or logistics providers can cause delays.", source: "Placeholder" },
    { title: "Cyber and supply chain", snippet: "Cyberattacks on suppliers or logistics systems can disrupt operations.", source: "Placeholder" },
  ];
}

/**
 * POST /api/risk/external-signals
 * Pulls external signals from the web (Gemini) tailored to the company profile, saves new ones to the DB, returns all saved signals.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = session.companyId;

  const company = await db.company.findUnique({
    where: { id: companyId },
    include: { baseProfile: true, highLevelProfile: true },
  });

  const companyContext: CompanyContext | null = company
    ? {
        name: company.name,
        sector: company.baseProfile?.sector ?? null,
        companyType: company.baseProfile?.companyType ?? null,
        sizeBand: company.baseProfile?.sizeBand ?? null,
        generatedSummary: company.baseProfile?.generatedSummary ?? null,
        rawInput: company.baseProfile?.rawInput ?? null,
        supplyChainMap: company.baseProfile?.supplyChainMap ?? undefined,
        highLevelNarrative: company.highLevelProfile?.generatedNarrative ?? null,
      }
    : null;

  const pulled = await pullFromWeb(companyContext);

  const existing = await db.savedExternalSignal.findMany({
    where: { companyId },
    select: { title: true },
  });
  const existingKeys = new Set(existing.map((r) => titleKey(r.title)));

  for (const s of pulled) {
    const key = titleKey(s.title);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    await db.savedExternalSignal.create({
      data: {
        companyId,
        title: s.title,
        snippet: s.snippet,
        url: s.url ?? null,
        source: s.source ?? null,
      },
    });
  }

  const rows = await db.savedExternalSignal.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  const signals: SavedExternalSignalItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    url: r.url ?? undefined,
    source: r.source ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));

  const pulledAt = rows.length > 0 ? rows[0].createdAt.toISOString() : null;

  return NextResponse.json({ signals, pulledAt });
}
