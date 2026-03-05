import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setZapierMCPServerUrl } from "@/server/zapier/mcp-config";
import { getZapierEmbedSecret } from "@/server/zapier/mcp-client";

/**
 * POST /api/zapier/mcp-url
 * Body: { serverUrl: string }
 * Saves the company's Zapier MCP server URL from the embed's mcp-server-url event.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getZapierEmbedSecret()) {
    return NextResponse.json(
      { error: "Zapier MCP embed not configured. Set ZAPIER_MCP_EMBED_SECRET in env." },
      { status: 503 }
    );
  }
  let body: { serverUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const serverUrl = typeof body?.serverUrl === "string" ? body.serverUrl.trim() : "";
  if (!serverUrl) {
    return NextResponse.json({ error: "Missing serverUrl" }, { status: 400 });
  }
  await setZapierMCPServerUrl(session.companyId, serverUrl);
  return NextResponse.json({ ok: true });
}
