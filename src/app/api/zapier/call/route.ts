import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany } from "@/server/zapier/mcp-config";

/**
 * POST /api/zapier/call
 * Body: { name: string, arguments?: Record<string, unknown> }
 * Calls a Zapier MCP tool using the company's embed server URL.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getZapierMCPConfigForCompany(session.companyId);
  if (!config) {
    return NextResponse.json(
      { error: "Zapier MCP not connected. Use the embed on Integrations to connect." },
      { status: 503 }
    );
  }

  let body: { name?: string; arguments?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body?.name;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'name'" }, { status: 400 });
  }

  const args = body?.arguments && typeof body.arguments === "object" ? body.arguments : {};

  try {
    const result = await callZapierMCPTool(config, name, args);
    return NextResponse.json({ content: result.content, isError: result.isError });
  } catch (err) {
    console.error("Zapier MCP callTool error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to call Zapier MCP tool" },
      { status: 502 }
    );
  }
}
