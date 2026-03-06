/**
 * Suggests whether a Zapier tool name is best used for input context (read data)
 * or execution (take action). Used to show hints on the integrations page.
 */
export type SuggestedZone = "input" | "execution" | null;

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
