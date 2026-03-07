import { callZapierMCPTool } from "./mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "./mcp-config";

export const DEFAULT_MAX_LIVE_CONTEXT_CHARS = 6000;

export function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  const readPatterns = ["find", "search", "list", "get", "fetch", "read", "retrieve"];
  const actionPatterns = ["reply", "send", "remove", "add", "create", "update", "delete", "mark", "move", "label"];
  if (actionPatterns.some((a) => lower.includes(a))) return false;
  return readPatterns.some((r) => lower.includes(r));
}

/**
 * Instructions for each Zapier tool type when fetching live context for high-level profile or risk assessment.
 * Google Sheets: ask for rows/summaries that inform supply chain, risk, inventory, suppliers.
 */
export function getProfileContextArgs(toolName: string): Record<string, unknown> {
  const lower = toolName.toLowerCase();
  let instructions =
    "Return up to 15 recent items that could inform supply chain, risk, or operations (e.g. orders, suppliers, shipments, meetings). Include subject/title and key details.";
  if (lower.includes("gmail") && (lower.includes("find") || lower.includes("search"))) {
    instructions =
      "Get my 15 most recent emails from inbox that might relate to suppliers, orders, or logistics. Return subject, sender, and a short snippet.";
  } else if (lower.includes("outlook") || lower.includes("microsoft")) {
    instructions = "Get my 15 most recent emails that could relate to supply chain or operations. Return subject and snippet.";
  } else if (lower.includes("slack")) {
    instructions =
      "Return up to 15 recent messages or threads that might relate to operations, suppliers, or risk. Include channel and summary.";
  } else if (lower.includes("calendar")) {
    instructions = "Return up to 15 upcoming or recent calendar events that might relate to supply chain or vendor meetings.";
  } else if (lower.includes("sheet") || lower.includes("spreadsheet")) {
    instructions =
      "Return spreadsheet data that could inform supply chain, risk, or operations: e.g. key rows from a sheet (suppliers, inventory, KPIs, orders, lead times). Include column headers and up to 15–20 rows or a clear summary of the data.";
  } else if (lower.includes("drive")) {
    instructions =
      "List or summarize up to 15 recent items (files, rows) that could inform supply chain or operations.";
  } else if (lower.includes("crm") || lower.includes("salesforce") || lower.includes("hubspot")) {
    instructions =
      "Return up to 15 recent records or activities that could inform customer demand, orders, or supply chain.";
  }
  return { instructions, limit: 15, max_results: 15, maxResults: 15 };
}

/**
 * Summarize one content item (e.g. MCP text part or parsed JSON) for inclusion in live context.
 * Handles emails, sheet rows (rows, values, data arrays), and generic objects.
 */
export function summarizeContentItem(item: unknown): string | null {
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
          const subj =
            typeof o.subject === "string"
              ? o.subject
              : typeof o.title === "string"
                ? o.title
                : typeof o.name === "string"
                  ? o.name
                  : undefined;
          const from =
            o.from && typeof o.from === "object"
              ? String((o.from as { email?: string }).email ?? (o.from as { name?: string }).name ?? "")
              : undefined;
          if (subj) lines.push(from ? `"${subj.slice(0, 60)}" from ${from}` : subj.slice(0, 80));
          else lines.push(JSON.stringify(o).slice(0, 80));
        }
      }
      return lines.join(" · ");
    }
    const rows = (parsed.rows ?? parsed.values ?? parsed.data) as unknown[] | undefined;
    if (Array.isArray(rows) && rows.length > 0) {
      const lines: string[] = [];
      for (const row of rows.slice(0, 15)) {
        if (Array.isArray(row)) {
          lines.push((row as unknown[]).map((c) => String(c)).join(" | ").slice(0, 120));
        } else if (row && typeof row === "object") {
          const o = row as Record<string, unknown>;
          const vals = Object.entries(o)
            .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
            .join("; ");
          lines.push(vals.slice(0, 120));
        }
      }
      return lines.join("\n");
    }
    const subj = parsed.subject ?? parsed.title ?? parsed.name;
    if (typeof subj === "string") return subj.slice(0, 200);
  } catch {
    // not JSON
  }
  return raw.slice(0, 300);
}

/**
 * Fetch live context from all read-only Zapier input-context tools (Gmail, Sheets, Slack, etc.)
 * for use in high-level profile generation or risk assessment.
 */
export async function fetchLiveContextFromZapier(
  companyId: string,
  maxChars: number = DEFAULT_MAX_LIVE_CONTEXT_CHARS
): Promise<string> {
  const config = await getZapierMCPConfigForCompany(companyId);
  const toolSelections = await getZapierMCPToolSelections(companyId);
  const inputTools = toolSelections.inputContextTools ?? [];
  if (!config || inputTools.length === 0) return "";

  const readOnly = inputTools.filter((t) => isReadOnlyTool(t));
  if (readOnly.length === 0) return "";

  const parts: string[] = [];
  let totalChars = 0;

  for (const toolName of readOnly) {
    if (totalChars >= maxChars) break;
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
        const take = Math.min(block.length, maxChars - totalChars - 50);
        if (take > 0) {
          parts.push(block.slice(0, take));
          totalChars += take;
        }
      }
    } catch (err) {
      console.error(`Live context: Zapier fetch failed for ${toolName}:`, err);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : "";
}
