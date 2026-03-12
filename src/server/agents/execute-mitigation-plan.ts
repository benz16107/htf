import { db } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { getGoogleEmailConnectionStatus, sendGmailEmail } from "@/server/email/google";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import { BackboardClient } from "@/server/memory/backboard-client";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import { getGlobalZapierAccessToken, createActionRun } from "@/server/zapier/client";
import * as XLSX from "xlsx";

type Action = {
  type: string;
  recipientOrEndpoint: string;
  payloadOrBody: string;
  requiresHumanApproval: boolean;
  stepTitle?: string;
};

type ExecuteMitigationPlanOptions = {
  companyId: string;
  planId: string;
  actionIndices?: number[];
  actionsOverride?: unknown[];
  executionSource?: "human" | "autonomous";
};

type ExecutionFailure = {
  index: number;
  stepTitle?: string;
  error: string;
};

type ExecutionArtifact = {
  index: number;
  stepTitle?: string;
  format: "csv" | "excel" | "google_sheets";
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
  destination?: string;
  preview?: string;
};

type FinancialReportFormat = "csv" | "excel" | "google_sheets";
type FinancialReportPayload = {
  format?: FinancialReportFormat;
  fileName?: string;
  sheetName?: string;
  spreadsheetTitle?: string;
  tabs?: Array<{
    name?: string;
    section?: "overview" | "financial_impact" | "scenario_comparison" | "drivers_assumptions" | "signal_details";
  }>;
};

type FinancialReportTab = {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
};

type GeminiFinancialReportResponse = {
  tabs?: Array<{
    name?: string;
    headers?: unknown[];
    rows?: unknown[];
  }>;
};

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export type ExecuteMitigationPlanResult = {
  plan: Awaited<ReturnType<typeof db.mitigationPlan.findUnique>>;
  executionResults?: {
    executed: number[];
    failed: ExecutionFailure[];
    artifacts?: ExecutionArtifact[];
  };
};

/** Pick an execution tool that looks like "send email" (e.g. Gmail: Send Email). */
function pickSendEmailTool(executionToolNames: string[]): string | null {
  const lower = executionToolNames.map((n) => n.toLowerCase());
  const idx = lower.findIndex(
    (n) =>
      (n.includes("send") && (n.includes("email") || n.includes("gmail") || n.includes("outbound"))) ||
      (n.includes("gmail") && n.includes("send")) ||
      (n.includes("email") && n.includes("send"))
  );
  return idx >= 0 ? (executionToolNames[idx] ?? null) : null;
}

/** Pick an execution tool that looks like Google Sheets create/append row/spreadsheet. */
function pickGoogleSheetsTool(executionToolNames: string[]): string | null {
  const lower = executionToolNames.map((n) => n.toLowerCase());
  const idx = lower.findIndex((n) => n.includes("sheet") || n.includes("google sheets"));
  return idx >= 0 ? (executionToolNames[idx] ?? null) : null;
}

/** True when the tool "failed" only because the Gmail label already exists — treat as success. */
function isLabelAlreadyExistsResult(result: { content?: unknown[]; isError?: boolean }): boolean {
  if (!result.isError || !result.content?.length) return false;
  const first = result.content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  return !!raw && (raw.includes("Label name exists or conflicts") || raw.includes("label name exists"));
}

/** True when the error is "cursor must be a string" (Zapier/Gmail quirk on label ops) — treat as success so plan can complete. */
function isCursorMustBeStringResult(result: { content?: unknown[]; isError?: boolean }): boolean {
  if (!result.isError || !result.content?.length) return false;
  const first = result.content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  return !!raw && raw.toLowerCase().includes("cursor") && raw.toLowerCase().includes("must be a string");
}

/** Extract error message from Zapier MCP tool result (content array with text parts). */
function getToolErrorMessage(result: { content?: unknown[]; isError?: boolean }): string | null {
  if (!result.isError) return null;
  const content = result.content ?? [];
  const first = content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  if (raw) {
    if (raw.includes("insufficient tasks on account")) {
      return "Insufficient tasks on your Zapier account. Check usage or upgrade at mcp.zapier.com.";
    }
    if (raw.includes("Label name exists or conflicts") || raw.includes("label name exists")) {
      return "This Gmail label already exists. Use the existing label or edit the step to use a different label name.";
    }
    try {
      const parsed = JSON.parse(raw) as { error?: string | string[] };
      const err = parsed?.error;
      if (Array.isArray(err)) return err.join(" ").trim() || raw;
      if (typeof err === "string") return err;
    } catch {
      // not JSON, use raw
    }
    return raw.slice(0, 500);
  }
  try {
    return JSON.stringify(content).slice(0, 500);
  } catch {
    return "Tool returned an error";
  }
}

/** Normalize Zapier/MCP error message for display (e.g. "insufficient tasks" -> friendly text). */
function normalizeErrorMessage(msg: string): string {
  if (msg.includes("insufficient tasks on account")) {
    return "Insufficient tasks on your Zapier account. Check usage or upgrade at mcp.zapier.com.";
  }
  if (msg.includes("Label name exists or conflicts") || msg.includes("label name exists")) {
    return "This Gmail label already exists. Use the existing label or edit the step to use a different label name.";
  }
  try {
    const parsed = JSON.parse(msg) as { error?: string | string[] };
    const err = parsed?.error;
    if (Array.isArray(err)) return err.join(" ").trim() || msg;
    if (typeof err === "string") return err;
  } catch {
    // not JSON
  }
  return msg.slice(0, 400);
}

function isCursorLikeKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "cursor" || k === "pagetoken" || k === "nextpagetoken" || k.endsWith("cursor");
}

/** Recursively remove cursor-like keys (avoids "cursor must be a string" errors from Zapier/Gmail). */
function deepStripCursors(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(deepStripCursors);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      if (!isCursorLikeKey(key)) out[key] = deepStripCursors(v);
    }
    return out;
  }
  return obj;
}

/** Ensure Zapier MCP tool args match expected types (e.g. to = array). Never send cursor-like params. */
function normalizeZapierMCPArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> = { ...args };
  const lower = toolName.toLowerCase();
  const isEmailLike = lower.includes("email") || lower.includes("draft") || lower.includes("send") || lower.includes("gmail");
  if (isEmailLike) {
    for (const key of ["to", "cc", "bcc", "recipients"]) {
      const v = out[key];
      if (typeof v === "string" && v.trim()) out[key] = [v.trim()];
      else if (Array.isArray(v)) out[key] = v.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter(Boolean);
    }
  }
  out = deepStripCursors(out) as Record<string, unknown>;
  return out;
}

function makeStatusError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function parseGeminiReportJson(raw: string): GeminiFinancialReportResponse {
  let text = raw.trim();
  const codeBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/;
  const match = text.match(codeBlock);
  if (match) text = match[1].trim();
  try {
    return JSON.parse(text) as GeminiFinancialReportResponse;
  } catch {
    const fixed = text.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(fixed) as GeminiFinancialReportResponse;
  }
}

function parseFinancialReportPayload(raw: string): FinancialReportPayload {
  if (!raw?.trim()) return { format: "csv" };
  try {
    const parsed = JSON.parse(raw) as FinancialReportPayload;
    const format =
      parsed?.format === "excel" || parsed?.format === "google_sheets" || parsed?.format === "csv"
        ? parsed.format
        : "csv";
    return {
      format,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : undefined,
      sheetName: typeof parsed.sheetName === "string" ? parsed.sheetName : undefined,
      spreadsheetTitle: typeof parsed.spreadsheetTitle === "string" ? parsed.spreadsheetTitle : undefined,
      tabs: Array.isArray(parsed.tabs)
        ? parsed.tabs
            .map((t) => ({
              name: typeof t?.name === "string" ? t.name : undefined,
              section:
                t?.section === "overview" ||
                t?.section === "financial_impact" ||
                t?.section === "scenario_comparison" ||
                t?.section === "drivers_assumptions" ||
                t?.section === "signal_details"
                  ? t.section
                  : undefined,
            }))
            .filter((t) => t.name || t.section)
        : undefined,
    };
  } catch {
    return { format: "csv" };
  }
}

function sanitizeSheetName(name: string): string {
  const sanitized = name.replace(/[\\/*?:[\]]/g, " ").trim();
  return (sanitized || "Sheet").slice(0, 31);
}

function toCell(value: unknown): string | number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toTabCell(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return String(value);
}

function hasMeaningfulTabContent(tab: FinancialReportTab): boolean {
  if (!Array.isArray(tab.rows) || tab.rows.length === 0) return false;
  let nonEmptyCells = 0;
  for (const row of tab.rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const text = typeof cell === "number" ? String(cell) : String(cell ?? "").trim();
      if (text !== "" && text !== "0" && text !== "0.0") nonEmptyCells++;
    }
  }
  return nonEmptyCells >= 3;
}

function inferDefaultSectionForName(name: string): keyof ReturnType<typeof buildDefaultFinancialTabs> {
  const n = name.toLowerCase();
  if (n.includes("overview")) return "overview";
  if (n.includes("scenario")) return "scenario_comparison";
  if (n.includes("driver") || n.includes("assumption")) return "drivers_assumptions";
  if (n.includes("signal")) return "signal_details";
  return "financial_impact";
}

function buildDefaultFinancialTabs(
  plan: any,
  scenario: Awaited<ReturnType<typeof db.scenario.findUnique>>,
  allScenarios: Array<Awaited<ReturnType<typeof db.scenario.findUnique>>>
): Record<string, FinancialReportTab> {
  const riskCase = plan?.riskCase;
  const financialImpact = (riskCase?.financialImpact ?? {}) as Record<string, unknown>;
  const serviceImpact = (riskCase?.serviceImpact ?? {}) as Record<string, unknown>;
  const timeWindow = (riskCase?.timeWindow ?? {}) as Record<string, unknown>;
  const keyDrivers = Array.isArray(riskCase?.keyDrivers) ? (riskCase?.keyDrivers as unknown[]) : [];
  const assumptions = Array.isArray(riskCase?.assumptions) ? (riskCase?.assumptions as unknown[]) : [];
  const entityMap = (riskCase?.entityMap ?? {}) as Record<string, unknown>;

  const overview: FinancialReportTab = {
    name: "Overview",
    headers: ["metric", "value"],
    rows: [
      ["trigger_type", toCell(riskCase?.triggerType ?? "Unknown")],
      ["severity", toCell(riskCase?.severity ?? "UNKNOWN")],
      ["confidence_level", toCell(riskCase?.confidenceLevel ?? "unknown")],
      ["selected_scenario", toCell(scenario?.name ?? "N/A")],
      ["expected_duration_days", toCell(timeWindow.expectedDurationDays ?? 0)],
    ],
  };

  const financial: FinancialReportTab = {
    name: "Financial Impact",
    headers: ["metric", "value", "unit", "source"],
    rows: [
      ["probability_point", Number(riskCase?.probabilityPoint ?? 0), "ratio_0_to_1", "risk_case"],
      ["probability_band_low", Number(riskCase?.probabilityBandLow ?? 0), "ratio_0_to_1", "risk_case"],
      ["probability_band_high", Number(riskCase?.probabilityBandHigh ?? 0), "ratio_0_to_1", "risk_case"],
      ["revenue_at_risk_usd", Number(financialImpact.revenueAtRiskUsd ?? 0), "USD", "risk_case.financialImpact"],
      ["hard_cost_increase_usd", Number(financialImpact.hardCostIncreaseUsd ?? 0), "USD", "risk_case.financialImpact"],
      ["margin_erosion_percent", Number(financialImpact.marginErosionPercent ?? 0), "percent", "risk_case.financialImpact"],
      ["service_timeline_weeks", Number(serviceImpact.timelineWeeks ?? 0), "weeks", "risk_case.serviceImpact"],
      ["scenario_cost_delta", Number(scenario?.costDelta ?? 0), "ratio", "scenario"],
      ["scenario_service_impact", Number(scenario?.serviceImpact ?? 0), "ratio", "scenario"],
      ["scenario_risk_reduction", Number(scenario?.riskReduction ?? 0), "ratio", "scenario"],
    ],
  };

  const scenarioComparison: FinancialReportTab = {
    name: "Scenario Comparison",
    headers: ["scenario", "recommendation", "cost_delta", "service_impact", "risk_reduction", "confidence_level"],
    rows: (allScenarios.length > 0 ? allScenarios : [scenario]).filter(Boolean).map((s) => ([
      toCell((s as { name?: unknown })?.name ?? "N/A"),
      toCell((s as { recommendation?: unknown })?.recommendation ?? ""),
      Number((s as { costDelta?: unknown })?.costDelta ?? 0),
      Number((s as { serviceImpact?: unknown })?.serviceImpact ?? 0),
      Number((s as { riskReduction?: unknown })?.riskReduction ?? 0),
      toCell((s as { confidenceLevel?: unknown })?.confidenceLevel ?? ""),
    ])),
  };

  const driversAndAssumptions: FinancialReportTab = {
    name: "Drivers & Assumptions",
    headers: ["category", "item"],
    rows: [],
  };
  keyDrivers.slice(0, 20).forEach((driver) => {
    driversAndAssumptions.rows.push(["key_driver", toCell(driver)]);
  });
  assumptions.slice(0, 20).forEach((assumption) => {
    driversAndAssumptions.rows.push(["assumption", toCell(assumption)]);
  });

  const signalDetailsRows: Array<Array<string | number>> = [];
  for (const [k, v] of Object.entries(entityMap)) {
    if (Array.isArray(v)) {
      v.slice(0, 20).forEach((entry, idx) => {
        signalDetailsRows.push([toCell(k), `${k}[${idx}]`, toCell(entry)]);
      });
    } else if (v && typeof v === "object") {
      for (const [nestedK, nestedV] of Object.entries(v as Record<string, unknown>)) {
        signalDetailsRows.push([toCell(k), toCell(nestedK), toCell(nestedV)]);
      }
    } else {
      signalDetailsRows.push(["entity", toCell(k), toCell(v)]);
    }
  }
  const signalDetails: FinancialReportTab = {
    name: "Signal Details",
    headers: ["source", "field", "value"],
    rows: signalDetailsRows.slice(0, 200),
  };

  return {
    overview,
    financial_impact: financial,
    scenario_comparison: scenarioComparison,
    drivers_assumptions: driversAndAssumptions,
    signal_details: signalDetails,
  };
}

function makeFinancialReportTabs(
  plan: any,
  scenario: Awaited<ReturnType<typeof db.scenario.findUnique>>,
  allScenarios: Array<Awaited<ReturnType<typeof db.scenario.findUnique>>>,
  payload: FinancialReportPayload
): FinancialReportTab[] {
  const defaults = buildDefaultFinancialTabs(plan, scenario, allScenarios);
  const requested = payload.tabs ?? [
    { section: "overview", name: "Overview" },
    { section: "financial_impact", name: "Financial Impact" },
    { section: "scenario_comparison", name: "Scenario Comparison" },
    { section: "drivers_assumptions", name: "Drivers & Assumptions" },
    { section: "signal_details", name: "Signal Details" },
  ];
  const tabs: FinancialReportTab[] = [];
  for (const req of requested) {
    const section = req.section ?? "financial_impact";
    const base = defaults[section];
    if (!base) continue;
    tabs.push({
      name: sanitizeSheetName(req.name?.trim() || base.name),
      headers: base.headers,
      rows: base.rows,
    });
  }
  return tabs.length > 0 ? tabs : [defaults.financial_impact];
}

async function makeGeminiFinancialReportTabs(
  companyId: string,
  plan: any,
  scenario: Awaited<ReturnType<typeof db.scenario.findUnique>>,
  allScenarios: Array<Awaited<ReturnType<typeof db.scenario.findUnique>>>,
  payload: FinancialReportPayload
): Promise<FinancialReportTab[]> {
  const fallbackTabs = makeFinancialReportTabs(plan, scenario, allScenarios, payload);
  const defaultsBySection = buildDefaultFinancialTabs(plan, scenario, allScenarios);
  try {
    const model = await getGeminiModelForCompany(companyId);
    const requestedTabs = (payload.tabs ?? []).map((t) => ({
      name: t.name ?? "",
      section: t.section ?? "",
    }));
    const prompt = [
      "You are a financial reporting assistant for supply-chain risk mitigation.",
      "Generate spreadsheet-ready report tabs in strict JSON.",
      "Output JSON only in this shape:",
      '{"tabs":[{"name":"string","headers":["h1","h2"],"rows":[["v1","v2"],["v1","v2"]]}]}',
      "Rules:",
      "- 3-8 columns per tab.",
      "- At least 5 rows per tab when data allows.",
      "- Use realistic numbers from provided risk/scenario context; do not fabricate entities outside context.",
      "- Keep cell values to strings or numbers only.",
      requestedTabs.length > 0
        ? `- You MUST return tabs matching these requested names/sections when applicable: ${JSON.stringify(requestedTabs)}`
        : "- Include tabs for Overview, Financial Impact, Scenario Comparison, Drivers & Assumptions, Signal Details.",
      `Risk case context: ${JSON.stringify(plan?.riskCase ?? {})}`,
      `Selected scenario: ${JSON.stringify(scenario ?? {})}`,
      `All scenarios: ${JSON.stringify(allScenarios ?? [])}`,
    ].join("\n");

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    if (!response.text) return fallbackTabs;

    const parsed = parseGeminiReportJson(response.text);
    const tabsRaw = Array.isArray(parsed.tabs) ? parsed.tabs : [];
    const geminiTabs: FinancialReportTab[] = tabsRaw
      .map((tab, idx) => {
        const headers = Array.isArray(tab.headers) ? tab.headers.map((h) => String(h ?? "")).filter(Boolean) : [];
        const rowsRaw = Array.isArray(tab.rows) ? tab.rows : [];
        const rows = rowsRaw
          .filter((row) => Array.isArray(row))
          .map((row) => (row as unknown[]).map((v) => toTabCell(v)));
        if (headers.length === 0 || rows.length === 0) return null;
        return {
          name: sanitizeSheetName((tab.name || `Sheet ${idx + 1}`).trim()),
          headers,
          rows,
        };
      })
      .filter((t): t is FinancialReportTab => !!t);

    if (geminiTabs.length === 0) return fallbackTabs;

    // Backfill weak/empty Gemini tabs with deterministic values so exports never look blank.
    const repairedTabs = geminiTabs.map((tab) => {
      if (hasMeaningfulTabContent(tab)) return tab;
      const section = inferDefaultSectionForName(tab.name);
      const replacement = defaultsBySection[section];
      return {
        name: tab.name || replacement.name,
        headers: replacement.headers,
        rows: replacement.rows,
      };
    });

    const meaningfulCount = repairedTabs.filter(hasMeaningfulTabContent).length;
    if (meaningfulCount === 0) return fallbackTabs;
    return repairedTabs;
  } catch {
    return fallbackTabs;
  }
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? "");
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, "\"\"")}"`;
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const lines = rows.map((r) => r.map((c) => escapeCsvCell(c)).join(","));
  return [headerLine, ...lines].join("\n");
}

function tabsToCsv(tabs: FinancialReportTab[]): string {
  return tabs
    .map((tab) => {
      const csv = toCsv(tab.headers, tab.rows);
      return `## ${tab.name}\n${csv}`;
    })
    .join("\n\n");
}

function bufferToBase64(buffer: Uint8Array | Buffer): string {
  return Buffer.from(buffer).toString("base64");
}

function artifactToEmailAttachment(artifact: ExecutionArtifact): { filename: string; mimeType?: string; contentBase64: string } | null {
  if (!artifact.fileName || !artifact.contentBase64) return null;
  if (artifact.format !== "csv" && artifact.format !== "excel") return null;
  return {
    filename: artifact.fileName,
    mimeType: artifact.mimeType,
    contentBase64: artifact.contentBase64,
  };
}

export async function executeMitigationPlan({
  companyId,
  planId,
  actionIndices,
  actionsOverride,
  executionSource = "human",
}: ExecuteMitigationPlanOptions): Promise<ExecuteMitigationPlanResult> {
  const isAutonomousExecution = executionSource === "autonomous";
  const plan = await db.mitigationPlan.findUnique({
    where: { id: planId },
    include: { riskCase: true },
  });

  if (!plan || plan.companyId !== companyId) {
    throw makeStatusError("Plan not found", 404);
  }

  const [zapierMCPConfig, toolSelections, zapierAccessToken, gmailStatus] = await Promise.all([
    getZapierMCPConfigForCompany(companyId),
    getZapierMCPToolSelections(companyId),
    getGlobalZapierAccessToken(),
    getGoogleEmailConnectionStatus(companyId),
  ]);
  const scenario = plan.scenarioId ? await db.scenario.findUnique({ where: { id: plan.scenarioId } }) : null;
  const allScenarios = await db.scenario.findMany({
    where: { riskCaseId: plan.riskCaseId },
    orderBy: { createdAt: "asc" },
  });
  const executionToolNames = toolSelections?.executionTools ?? [];

  const allActions = (Array.isArray(actionsOverride) ? actionsOverride : ((plan.actions as Action[]) || [])) as Action[];
  const indicesToRun = Array.isArray(actionIndices) && actionIndices.length > 0
    ? actionIndices.filter((i: number) => i >= 0 && i < allActions.length)
    : allActions.map((_, i) => i);
  // Ensure financial report artifacts are available before sending emails.
  const orderedIndicesToRun = [...indicesToRun].sort((a, b) => {
    const ta = allActions[a]?.type ?? "";
    const tb = allActions[b]?.type ?? "";
    const pa = ta === "financial_report" ? 0 : 1;
    const pb = tb === "financial_report" ? 0 : 1;
    return pa - pb;
  });

  const executionResults: { executed: number[]; failed: ExecutionFailure[]; artifacts?: ExecutionArtifact[] } = {
    executed: [],
    failed: [],
  };
  const generatedFinancialArtifacts: ExecutionArtifact[] = [];
  const pushFinancialArtifact = (artifact: ExecutionArtifact) => {
    generatedFinancialArtifacts.push(artifact);
    const artifactForResults = isAutonomousExecution && (artifact.format === "csv" || artifact.format === "excel")
      ? { ...artifact, contentBase64: undefined }
      : artifact;
    executionResults.artifacts = executionResults.artifacts ?? [];
    executionResults.artifacts.push(artifactForResults);
  };

  for (const i of orderedIndicesToRun) {
    const action = allActions[i];
    if (!action) continue;
    if (action.type === "insight" || action.type === "recommendation") continue;

    const stepTitle = action.stepTitle ?? `Action ${i + 1}`;
    const recordFailure = (error: string) => {
      executionResults.failed.push({ index: i, stepTitle, error });
      console.error(`Execution failed [${stepTitle}]`, error);
    };

    if (action.type === "financial_report") {
      const payload = parseFinancialReportPayload(action.payloadOrBody ?? "");
      const tabs = await makeGeminiFinancialReportTabs(companyId, plan, scenario, allScenarios, payload);
      const fileStem = (payload.fileName?.trim() || `financial-impact-${plan.id}`).replace(/\s+/g, "-");
      const requestedFormat: FinancialReportFormat = payload.format ?? "csv";
      const sheetsTool = pickGoogleSheetsTool(executionToolNames);
      const format: FinancialReportFormat =
        requestedFormat === "google_sheets" && (!zapierMCPConfig || !sheetsTool)
          ? "excel"
          : requestedFormat;

      if (format === "google_sheets") {
        if (!zapierMCPConfig || !sheetsTool) {
          recordFailure("Google Sheets export requested, but no Sheets connection/tool is available.");
          continue;
        }
        try {
          const instructions = [
            `Create or append a sheet for financial impact details.`,
            `Spreadsheet title: ${payload.spreadsheetTitle || `Financial impact - ${plan.riskCase.triggerType}`}.`,
            `Create tabs: ${tabs.map((t) => t.name).join(", ")}.`,
            `Each tab should include its headers and rows exactly as provided.`,
          ].join(" ");
          const result = await callZapierMCPTool(zapierMCPConfig, sheetsTool, {
            instructions,
            spreadsheet_title: payload.spreadsheetTitle || `Financial impact - ${plan.riskCase.triggerType}`,
            sheet_name: payload.sheetName || tabs[0]?.name || "Financial Impact",
            tabs: tabs.map((tab) => ({
              name: tab.name,
              headers: tab.headers,
              rows: tab.rows,
            })),
          });
          const errMsg = getToolErrorMessage(result);
          if (errMsg) {
            recordFailure(normalizeErrorMessage(errMsg));
          } else {
            executionResults.executed.push(i);
            pushFinancialArtifact({
              index: i,
              stepTitle,
              format: "google_sheets",
              destination: "google_sheets",
              preview: `Exported ${tabs.length} tabs to Google Sheets via ${sheetsTool}: ${tabs.map((t) => t.name).join(", ")}.`,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          recordFailure(normalizeErrorMessage(msg));
        }
        continue;
      }

      const csv = tabsToCsv(tabs);
      if (format === "excel") {
        try {
          const workbook = XLSX.utils.book_new();
          tabs.forEach((tab) => {
            const worksheet = XLSX.utils.aoa_to_sheet([tab.headers, ...tab.rows]);
            XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(tab.name));
          });
          const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
          executionResults.executed.push(i);
          pushFinancialArtifact({
            index: i,
            stepTitle,
            format: "excel",
            fileName: `${fileStem}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            contentBase64: bufferToBase64(bytes),
            preview:
              requestedFormat === "google_sheets"
                ? `Google Sheets tool not available; generated Gemini-authored XLSX fallback with ${tabs.length} tabs.`
                : `Generated Gemini-authored XLSX export with ${tabs.length} tabs.`,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          recordFailure(normalizeErrorMessage(msg));
        }
      } else {
        executionResults.executed.push(i);
        pushFinancialArtifact({
          index: i,
          stepTitle,
          format: "csv",
          fileName: `${fileStem}.csv`,
          mimeType: "text/csv",
          contentBase64: bufferToBase64(Buffer.from(csv, "utf-8")),
          preview: `Generated Gemini-authored CSV export with ${tabs.length} sections.`,
        });
      }
      continue;
    }

    if (action.type === "zapier_mcp" && zapierMCPConfig) {
      try {
        const payload = JSON.parse(action.payloadOrBody) as {
          toolName?: string;
          arguments?: Record<string, unknown>;
        };
        if (payload?.toolName) {
          const rawArgs = (payload.arguments && typeof payload.arguments === "object")
            ? { ...payload.arguments }
            : {};
          const args = normalizeZapierMCPArgs(payload.toolName, rawArgs);
          const bodyText = typeof action.payloadOrBody === "string" ? action.payloadOrBody : "";
          if (!Object.prototype.hasOwnProperty.call(args, "instructions") && (stepTitle || bodyText)) {
            (args as Record<string, unknown>).instructions = [stepTitle, bodyText].filter(Boolean).join(". ").slice(0, 2000);
          }
          const result = await callZapierMCPTool(zapierMCPConfig, payload.toolName, args);
          if (isLabelAlreadyExistsResult(result) || isCursorMustBeStringResult(result)) {
            executionResults.executed.push(i);
          } else {
            const errMsg = getToolErrorMessage(result);
            if (errMsg) {
              recordFailure(normalizeErrorMessage(errMsg));
            } else {
              executionResults.executed.push(i);
            }
          }
        } else {
          recordFailure("Missing toolName in payload");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isCursorError = msg.toLowerCase().includes("cursor") && msg.toLowerCase().includes("must be a string");
        if (isCursorError) {
          executionResults.executed.push(i);
        } else {
          recordFailure(normalizeErrorMessage(msg));
        }
      }
      continue;
    }

    if (action.type === "email") {
      const to = action.recipientOrEndpoint?.trim() || "";
      if (!to) {
        // Back-compat: older drafts sometimes emitted non-email automation steps as type=email
        // without a recipient. Do not block full plan execution on this validation issue.
        executionResults.executed.push(i);
        continue;
      }
      const subject = plan.riskCase?.triggerType
        ? `Re: ${String(plan.riskCase.triggerType).slice(0, 60)}`
        : "Risk mitigation follow-up";
      const body = (action.payloadOrBody ?? "").trim() || "(No body)";

      if (gmailStatus.connected && gmailStatus.sendReady) {
        try {
          const attachments = generatedFinancialArtifacts
            .map(artifactToEmailAttachment)
            .filter((x): x is NonNullable<typeof x> => !!x);
          await sendGmailEmail({
            companyId,
            to,
            subject,
            body,
            attachments,
          });
          executionResults.executed.push(i);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          recordFailure(normalizeErrorMessage(msg));
        }
        continue;
      }

      if (!zapierMCPConfig) {
        recordFailure(
          gmailStatus.connected && !gmailStatus.sendReady
            ? "Direct Gmail is connected but does not have send permission yet. Reconnect Gmail in Dashboard → Integrations to grant send access, or connect Zapier with a send-email tool."
            : "No email delivery path is connected. Connect Gmail directly in Dashboard → Integrations, or connect Zapier with a send-email tool."
        );
        continue;
      }
      if (executionToolNames.length === 0) {
        recordFailure("No execution tools configured. Add a send-email tool to Execution in Integrations, or connect Gmail directly.");
        continue;
      }
      const sendEmailTool = pickSendEmailTool(executionToolNames);
      if (!sendEmailTool) {
        recordFailure("No send-email tool in Execution. Add Gmail: Send Email to Execution in Integrations, or use direct Gmail.");
        continue;
      }
      try {
        const attachments = generatedFinancialArtifacts
          .map(artifactToEmailAttachment)
          .filter((x): x is NonNullable<typeof x> => !!x);
        const attachmentSummary = attachments.length > 0
          ? ` Attach these files: ${attachments.map((a) => a.filename).join(", ")}.`
          : "";
        const instructions = `Send an email to ${to} with subject "${subject}". Body: ${body.slice(0, 2000)}.${attachmentSummary}`;
        const toArray = to ? [to] : [];
        const result = await callZapierMCPTool(zapierMCPConfig, sendEmailTool, {
          instructions,
          to: toArray,
          subject,
          body,
          message: body,
          recipient: toArray,
          email_address: toArray,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            mime_type: a.mimeType,
            content_base64: a.contentBase64,
          })),
        });
        const errMsg = getToolErrorMessage(result);
        if (errMsg) {
          recordFailure(errMsg);
        } else {
          executionResults.executed.push(i);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        recordFailure(normalizeErrorMessage(msg));
      }
      continue;
    }

    if ((action.type === "zapier_action" || action.type === "email") && zapierAccessToken) {
      try {
        const payload = JSON.parse(action.payloadOrBody) as {
          action?: string;
          authentication?: string;
          input?: Record<string, unknown>;
        };
        if (payload?.action && payload?.authentication) {
          await createActionRun(zapierAccessToken, {
            action: payload.action,
            authentication: payload.authentication,
            input: payload.input ?? {},
          });
          executionResults.executed.push(i);
        } else {
          recordFailure("Missing action/authentication in payload");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        recordFailure(normalizeErrorMessage(msg));
      }
    }
  }

  if (executionResults.failed.length > 0) {
    return {
      plan: await db.mitigationPlan.findUnique({ where: { id: planId } }),
      executionResults,
    };
  }

  const updatedPlan = await db.mitigationPlan.update({
    where: { id: planId },
    data: { status: "EXECUTED" },
  });

  const agentSession = await db.agentSession.create({
    data: {
      companyId,
      agentType: "SIGNAL_RISK",
      status: "COMPLETED",
    },
  });

  const executedActions = indicesToRun.map((i) => allActions[i]).filter(Boolean);
  const partialExecution = indicesToRun.length < allActions.length;
  const isAutonomous = executionSource === "autonomous";
  await db.reasoningTrace.create({
    data: {
      companyId,
      sessionId: agentSession.id,
      stepKey: isAutonomous ? "autonomous_execution_approved" : "human_override_approved",
      stepTitle: isAutonomous
        ? (partialExecution ? "Autonomous Agent Executed Selected Actions" : "Autonomous Agent Executed Plan")
        : (partialExecution ? "Human Operator Approved Partial Execution" : "Human Operator Approved Execution"),
      rationale: isAutonomous
        ? `Autonomous agent executed ${indicesToRun.length} of ${allActions.length} actions for ${plan.riskCase.triggerType}.`
        : `Human operator reviewed and approved ${indicesToRun.length} of ${allActions.length} actions for ${plan.riskCase.triggerType}.`,
      evidencePack: {
        planId: plan.id,
        actionIndices: indicesToRun,
        actions: executedActions,
      },
    },
  });

  const company = await db.company.findUnique({
    where: { id: companyId },
    include: { memoryThreads: { where: { agentType: "SIGNAL_RISK" } } },
  });
  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  const threadId = company?.memoryThreads[0]?.backboardThreadId;
  if (backboard.isConfigured() && threadId) {
    await backboard.appendReasoning(threadId, {
      action: isAutonomous ? "Autonomous Agent Executed Plan" : "Human Overrode & Approved Execution",
      planId: plan.id,
      triggerFired: true,
      summary: "Webhooks successfully dispatched.",
    });
  }

  const hasExecutionDetails =
    executionResults.executed.length > 0 ||
    executionResults.failed.length > 0 ||
    (executionResults.artifacts?.length ?? 0) > 0;

  if (hasExecutionDetails) {
    return {
      plan: updatedPlan,
      executionResults,
    };
  }

  return { plan: updatedPlan };
}
