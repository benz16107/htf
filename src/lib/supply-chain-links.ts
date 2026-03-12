export type SupplyChainLink = {
  name: string;
  type: string;
  purpose: string;
  connections: string;
  process: string;
  location: string;
  criticality: string;
  notes: string;
};

const EMPTY_LINK: SupplyChainLink = {
  name: "",
  type: "",
  purpose: "",
  connections: "",
  process: "",
  location: "",
  criticality: "",
  notes: "",
};

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLink(link: unknown): SupplyChainLink | null {
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;
  const row = link as Record<string, unknown>;
  const normalized: SupplyChainLink = {
    name: toTrimmedString(row.name),
    type: toTrimmedString(row.type),
    purpose: toTrimmedString(row.purpose),
    connections: toTrimmedString(row.connections),
    process: toTrimmedString(row.process),
    location: toTrimmedString(row.location),
    criticality: toTrimmedString(row.criticality),
    notes: toTrimmedString(row.notes),
  };

  const hasAnyValue = Object.values(normalized).some((value) => value.length > 0);
  return hasAnyValue ? normalized : null;
}

export function parseSupplyChainLinks(input: unknown): SupplyChainLink[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const rawLinks = (input as { links?: unknown }).links;
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks.map(normalizeLink).filter((row): row is SupplyChainLink => row !== null);
}

export function buildSupplyChainLinksPayload(
  links: SupplyChainLink[],
  source: "manual" | "ai",
  inputPrompt?: string,
) {
  return {
    source,
    inputPrompt: inputPrompt?.trim() || null,
    updatedAt: new Date().toISOString(),
    links,
  };
}

export function createEmptySupplyChainLink(): SupplyChainLink {
  return { ...EMPTY_LINK };
}
