export const GEMINI_MODEL_OPTIONS = [
  {
    id: "gemini-2.5-flash",
    label: "Balanced (faster)",
    description: "Lower latency for most setup, signal, and chat tasks.",
  },
  {
    id: "gemini-2.5-pro",
    label: "High accuracy (slower)",
    description: "Higher quality reasoning for complex analysis.",
  },
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_OPTIONS)[number]["id"];

const GEMINI_MODEL_SET = new Set<GeminiModelId>(GEMINI_MODEL_OPTIONS.map((option) => option.id));

export function isGeminiModelId(value: string): value is GeminiModelId {
  return GEMINI_MODEL_SET.has(value as GeminiModelId);
}
