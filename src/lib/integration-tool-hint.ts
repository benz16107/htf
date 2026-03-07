/**
 * Suggests whether a Zapier tool name is best used for input context (read data)
 * or execution (take action). Used to show hints on the integrations page.
 */
export type SuggestedZone = "input" | "execution" | null;

/** Extract app/integration key from Zapier tool name (e.g. gmail_find_email → gmail, google_sheets_get_data → google_sheets). */
export function getAppKeyFromToolName(toolName: string): string {
  const parts = toolName.split("_").filter(Boolean);
  if (parts.length === 0) return "other";
  if (parts[0] === "google" && parts.length >= 2) return `${parts[0]}_${parts[1]}`;
  if (parts[0] === "microsoft" && parts.length >= 2) return `${parts[0]}_${parts[1]}`;
  return parts[0];
}

/** Human-readable label for an app key (e.g. gmail → Gmail, google_sheets → Google Sheets). */
export function getAppDisplayName(appKey: string): string {
  const known: Record<string, string> = {
    gmail: "Gmail",
    google_sheets: "Google Sheets",
    google_drive: "Google Drive",
    google_calendar: "Google Calendar",
    outlook: "Outlook",
    microsoft_outlook: "Microsoft Outlook",
    microsoft_teams: "Microsoft Teams",
    slack: "Slack",
    hubspot: "HubSpot",
    salesforce: "Salesforce",
    airtable: "Airtable",
    notion: "Notion",
    trello: "Trello",
    asana: "Asana",
    zendesk: "Zendesk",
    shopify: "Shopify",
    quickbooks: "QuickBooks",
  };
  if (known[appKey]) return known[appKey];
  return appKey.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(" ");
}

/** Group tools by application for display (same app in one section). */
export function groupToolsByApp(tools: { name: string; description?: string }[]): { appKey: string; appLabel: string; tools: { name: string; description?: string }[] }[] {
  const byApp = new Map<string, { name: string; description?: string }[]>();
  for (const tool of tools) {
    const key = getAppKeyFromToolName(tool.name);
    if (!byApp.has(key)) byApp.set(key, []);
    byApp.get(key)!.push(tool);
  }
  return Array.from(byApp.entries())
    .map(([appKey, toolsInApp]) => ({ appKey, appLabel: getAppDisplayName(appKey), tools: toolsInApp }))
    .sort((a, b) => a.appLabel.localeCompare(b.appLabel));
}

const INPUT_PATTERNS = [
  "find", "search", "list", "get", "fetch", "read", "retrieve", "lookup",
  "view", "show", "load",
];
const EXECUTION_PATTERNS = [
  "send", "reply", "create", "update", "delete", "remove", "add", "archive",
  "draft", "mark", "move", "label", "post", "trigger", "execute", "submit",
];

export function getSuggestedZoneForTool(toolName: string): SuggestedZone {
  const lower = toolName.toLowerCase();
  if (EXECUTION_PATTERNS.some((p) => lower.includes(p))) return "execution";
  if (INPUT_PATTERNS.some((p) => lower.includes(p))) return "input";
  return null;
}

export function getSuggestedZoneLabel(zone: SuggestedZone): string | null {
  if (zone === "input") return "Best for: Input context";
  if (zone === "execution") return "Best for: Execution";
  return null;
}
