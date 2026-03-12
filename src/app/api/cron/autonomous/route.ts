import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renewExpiringGmailWatches } from "@/server/email/google";

function getOrigin(req: Request): string {
  const url = req.url;
  if (typeof url === "string") {
    try {
      return new URL(url).origin;
    } catch {
      //
    }
  }
  return process.env.NEXTAUTH_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    || "http://localhost:3000";
}

/**
 * GET or POST /api/cron/autonomous
 * Called by Vercel Cron (or any external cron) every 2 minutes.
 * Triggers an autonomous run for every company that has agentRunning: true,
 * so the agent keeps running in the background when no one is on the page.
 * Auth: CRON_SECRET in env; send as Authorization: Bearer <CRON_SECRET> or header x-cron-secret.
 */
export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}

async function runCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-cron-secret");
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await db.autonomousAgentConfig.findMany({
    where: { agentRunning: true },
    select: { companyId: true },
  });
  const origin = getOrigin(req);
  if (!origin.startsWith("http")) {
    return NextResponse.json(
      { error: "Could not determine origin for run requests" },
      { status: 500 }
    );
  }

  const results: { companyId: string; ok: boolean; ingestStatus?: number; status?: number }[] = [];
  for (const { companyId } of configs) {
    try {
      let ingestStatus: number | undefined;
      const ingestRes = await fetch(`${origin}/api/risk/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ companyId }),
        cache: "no-store",
      });
      ingestStatus = ingestRes.status;
      if (!ingestRes.ok) {
        const text = await ingestRes.text().catch(() => "");
        console.error(
          "Cron ingest fetch error for company %s: status=%d body=%s",
          companyId,
          ingestRes.status,
          text.slice(0, 200)
        );
      }

      const res = await fetch(`${origin}/api/agents/autonomous/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ companyId, continuous: true }),
        cache: "no-store",
      });
      results.push({ companyId, ok: res.ok, ingestStatus, status: res.status });
    } catch (err) {
      console.error("Cron autonomous run fetch error:", err);
      results.push({ companyId, ok: false });
    }
  }

  let gmailWatches = { checked: 0, renewed: 0, failed: 0 };
  try {
    gmailWatches = await renewExpiringGmailWatches();
  } catch (err) {
    console.error("Cron Gmail watch renewal error:", err);
  }

  return NextResponse.json({
    ok: true,
    triggered: configs.length,
    results,
    gmailWatches,
  });
}
