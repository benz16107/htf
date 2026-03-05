import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listZapierMCPTools } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany } from "@/server/zapier/mcp-config";

/**
 * GET /api/zapier/tools
 * Returns tools from the company's Zapier MCP server (embed URL + ZAPIER_MCP_EMBED_SECRET).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getZapierMCPConfigForCompany(session.companyId);
  if (!config) {
    return NextResponse.json(
      { tools: [], message: "Connect Zapier in the embed below, or set ZAPIER_MCP_SERVER_URL and ZAPIER_MCP_SECRET in env." },
      { status: 200 }
    );
  }

  try {
    const tools = await listZapierMCPTools(config);
    return NextResponse.json({ tools });
  } catch (err) {
    console.error("Zapier MCP listTools error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list Zapier MCP tools", tools: [] },
      { status: 502 }
    );
  }
}
