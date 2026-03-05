/**
 * Zapier MCP client. Uses Zapier MCP embeds: each company has their own
 * server URL (from the embed's mcp-server-url event); auth uses the shared
 * embed secret. Connects via Streamable HTTP and exposes listTools / callTool.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const clientCache = new Map<string, { client: Client; transport: StreamableHTTPClientTransport }>();

export type ZapierMCPTool = {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; required?: string[] };
};

/** Embed secret from env (used with per-company server URLs from the embed). */
export function getZapierEmbedSecret(): string | null {
  return process.env.ZAPIER_MCP_EMBED_SECRET?.trim() || null;
}

/** Optional global config (single server for all). Superseded by per-company URL when using embeds. */
export function getZapierMCPGlobalConfig(): { serverUrl: string; secret: string } | null {
  const url = process.env.ZAPIER_MCP_SERVER_URL?.trim();
  const secret = process.env.ZAPIER_MCP_SECRET?.trim();
  if (!url || !secret) return null;
  return { serverUrl: url, secret };
}

export type ZapierMCPConfig = { serverUrl: string; secret: string };

/** Whether MCP is usable (embed secret set, or global URL set). */
export function isZapierMCPConfigured(): boolean {
  return !!getZapierEmbedSecret() || !!getZapierMCPGlobalConfig();
}

async function getOrCreateClient(config: ZapierMCPConfig): Promise<Client | null> {
  const { serverUrl, secret } = config;
  if (!serverUrl || !secret) return null;

  const cached = clientCache.get(serverUrl);
  if (cached) return cached.client;

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${secret}` },
    },
  });

  const client = new Client(
    { name: "htf-zapier", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  clientCache.set(serverUrl, { client, transport });
  return client;
}

/**
 * List tools from a Zapier MCP server (per-company URL + embed secret, or global config).
 */
export async function listZapierMCPTools(config: ZapierMCPConfig | null): Promise<ZapierMCPTool[]> {
  if (!config) return [];
  const client = await getOrCreateClient(config);
  if (!client) return [];

  const result = await client.listTools();
  const tools = (result as { tools?: ZapierMCPTool[] }).tools ?? [];
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/**
 * Call a Zapier MCP tool (per-company URL + embed secret, or global config).
 */
export async function callZapierMCPTool(
  config: ZapierMCPConfig | null,
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ content: unknown[]; isError?: boolean }> {
  if (!config) throw new Error("Zapier MCP not configured");
  const client = await getOrCreateClient(config);
  if (!client) throw new Error("Zapier MCP not configured");

  const result = await client.callTool({ name, arguments: args });
  const content = (result as { content?: unknown[] }).content ?? [];
  const isError = (result as { isError?: boolean }).isError;
  return { content, isError };
}

/**
 * Close a cached connection by server URL (e.g. when company disconnects).
 */
export async function closeZapierMCPClientByUrl(serverUrl: string): Promise<void> {
  const cached = clientCache.get(serverUrl);
  if (cached) {
    await cached.transport.close();
    clientCache.delete(serverUrl);
  }
}

export async function closeAllZapierMCPClients(): Promise<void> {
  await Promise.all([...clientCache.keys()].map(closeZapierMCPClientByUrl));
}
