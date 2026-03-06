import { db } from "@/lib/db";
import { getZapierEmbedSecret, type ZapierMCPConfig } from "./mcp-client";

const PROVIDER = "zapier_mcp";

export type ZapierMCPToolSelections = {
  inputContextTools: string[];
  executionTools: string[];
};

type ZapierMCPMetadata = {
  serverUrl?: string;
  inputContextTools?: string[];
  executionTools?: string[];
};

/**
 * Returns MCP config for a company: only their stored embed server URL + embed secret.
 * No global fallback — each company must connect Zapier in the embed to see or use tools.
 */
export async function getZapierMCPConfigForCompany(companyId: string): Promise<ZapierMCPConfig | null> {
  const embedSecret = getZapierEmbedSecret();
  const row = await db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true },
  });
  const meta = row?.metadata as ZapierMCPMetadata | null;
  const serverUrl = meta?.serverUrl;
  if (serverUrl && embedSecret) return { serverUrl, secret: embedSecret };
  return null;
}

/**
 * Returns the two tool selection lists for the company (input context vs execution).
 */
export async function getZapierMCPToolSelections(companyId: string): Promise<ZapierMCPToolSelections> {
  const row = await db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true },
  });
  const meta = (row?.metadata as ZapierMCPMetadata | null) ?? {};
  return {
    inputContextTools: Array.isArray(meta.inputContextTools) ? meta.inputContextTools : [],
    executionTools: Array.isArray(meta.executionTools) ? meta.executionTools : [],
  };
}

/**
 * Saves the company's Zapier MCP server URL (from the embed mcp-server-url event).
 * Merges with existing metadata so tool selections are preserved.
 */
export async function setZapierMCPServerUrl(companyId: string, serverUrl: string): Promise<void> {
  if (!serverUrl?.trim()) return;
  const existing = await db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true },
  });
  const meta = (existing?.metadata as ZapierMCPMetadata | null) ?? {};
  const nextMeta: ZapierMCPMetadata = { ...meta, serverUrl: serverUrl.trim() };
  await db.integrationConnection.upsert({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    create: {
      companyId,
      provider: PROVIDER,
      status: "connected",
      authType: "embed",
      metadata: nextMeta,
    },
    update: { status: "connected", metadata: nextMeta },
  });
}

/**
 * Saves input-context and execution tool selections. Merges with existing metadata (e.g. serverUrl).
 */
export async function saveZapierMCPToolSelections(
  companyId: string,
  selections: ZapierMCPToolSelections,
): Promise<void> {
  const existing = await db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true },
  });
  const meta = (existing?.metadata as ZapierMCPMetadata | null) ?? {};
  const nextMeta: ZapierMCPMetadata = {
    ...meta,
    inputContextTools: selections.inputContextTools,
    executionTools: selections.executionTools,
  };
  await db.integrationConnection.upsert({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    create: {
      companyId,
      provider: PROVIDER,
      status: "connected",
      authType: "embed",
      metadata: nextMeta,
    },
    update: { metadata: nextMeta },
  });
}
