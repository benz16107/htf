import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { createLiveIngestToken } from "@/server/risk/live-internal-signals";

/**
 * GET /api/risk/ingest/live-config
 * Returns the Zapier webhook URL for pushing live inbox events into internal signals.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = createLiveIngestToken(session.companyId);
  if (!token) {
    return NextResponse.json(
      { error: "Live ingest is not configured. Set INTERNAL_API_SECRET or NEXTAUTH_SECRET." },
      { status: 503 }
    );
  }

  const origin = getRequestOrigin(request);
  const url = new URL("/api/risk/ingest/live", origin);
  url.searchParams.set("companyId", session.companyId);
  url.searchParams.set("token", token);

  return NextResponse.json({
    url: url.toString(),
    companyId: session.companyId,
    method: "POST",
    sample: {
      subject: "Supplier delay on PO-1042",
      from: { email: "ops@example.com", name: "Ops" },
      snippet: "Vendor pushed ETA by 3 days",
      body: "Vendor pushed ETA by 3 days due to capacity constraints.",
      messageId: "<example-message-id@example.com>",
      receivedAt: new Date().toISOString(),
      source: "gmail",
      toolName: "gmail_new_email",
    },
  });
}
