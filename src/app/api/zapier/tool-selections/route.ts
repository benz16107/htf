import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import { getGoogleEmailConnectionStatus } from "@/server/email/google";

/**
 * GET /api/zapier/tool-selections
 * Returns the company's saved input-context and execution tool names (for display/filtering).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ inputContextTools, executionTools }, emailStatus] = await Promise.all([
    getZapierMCPToolSelections(session.companyId),
    getGoogleEmailConnectionStatus(session.companyId),
  ]);

  return NextResponse.json({
    inputContextTools,
    executionTools,
    directEmailConnected: emailStatus.connected,
  });
}
