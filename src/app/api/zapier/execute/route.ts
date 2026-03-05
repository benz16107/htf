import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGlobalZapierAccessToken, createActionRun } from "@/server/zapier/client";

/**
 * POST /api/zapier/execute
 * Run a Zapier action using the platform's shared Zapier account.
 * Body: { action: string, authentication: string, input: Record<string, unknown> }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getGlobalZapierAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Zapier not configured. Set ZAPIER_ACCESS_TOKEN in env." },
      { status: 503 }
    );
  }

  let body: { action: string; authentication: string; input?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, authentication, input = {} } = body;
  if (!action || !authentication) {
    return NextResponse.json(
      { error: "Missing action or authentication" },
      { status: 400 }
    );
  }

  try {
    const result = await createActionRun(accessToken, {
      action,
      authentication,
      input: input as Record<string, unknown>,
    });
    return NextResponse.json({
      success: true,
      runId: result.data?.id,
      message: "Action run started.",
    });
  } catch (err) {
    console.error("Zapier execute error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Zapier action failed" },
      { status: 502 }
    );
  }
}
