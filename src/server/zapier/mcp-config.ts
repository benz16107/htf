import { db } from "@/lib/db";
import { getZapierEmbedSecret, getZapierMCPGlobalConfig, type ZapierMCPConfig } from "./mcp-client";

const PROVIDER = "zapier_mcp";

/**
 * Returns MCP config for a company: their stored embed server URL + embed secret.
 * Falls back to global env config if no company row exists.
 */
export async function getZapierMCPConfigForCompany(companyId: string): Promise<ZapierMCPConfig | null> {
  const embedSecret = getZapierEmbedSecret();
  const row = await db.integrationConnection.findUnique({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    select: { metadata: true },
  });
  const serverUrl = (row?.metadata as { serverUrl?: string } | null)?.serverUrl;
  if (serverUrl && embedSecret) return { serverUrl, secret: embedSecret };
  return getZapierMCPGlobalConfig();
}

/**
 * Saves the company's Zapier MCP server URL (from the embed mcp-server-url event).
 */
export async function setZapierMCPServerUrl(companyId: string, serverUrl: string): Promise<void> {
  if (!serverUrl?.trim()) return;
  await db.integrationConnection.upsert({
    where: { companyId_provider: { companyId, provider: PROVIDER } },
    create: {
      companyId,
      provider: PROVIDER,
      status: "connected",
      authType: "embed",
      metadata: { serverUrl: serverUrl.trim() },
    },
    update: {
      status: "connected",
      metadata: { serverUrl: serverUrl.trim() },
    },
  });
}
