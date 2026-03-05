import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getGlobalZapierAccessToken,
  listApps,
  listAuthentications,
} from "@/server/zapier/client";

/**
 * GET /api/setup/zapier/apps
 * Returns the list of Zapier apps and optionally authentications for an app.
 * Uses the platform's shared Zapier account (env: ZAPIER_ACCESS_TOKEN or refresh).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getGlobalZapierAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Zapier not configured. Set ZAPIER_ACCESS_TOKEN (or refresh credentials) in env." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const appId = url.searchParams.get("app");

  try {
    const [appsRes, authenticationsRes] = await Promise.all([
      listApps(accessToken),
      appId ? listAuthentications(accessToken, appId) : Promise.resolve(null),
    ]);

    const body: {
      apps: { id: string; title: string }[];
      authentications?: { id: string; app: string; title: string; is_expired: boolean }[];
    } = {
      apps: (appsRes.data || []).map((a: { id: string; title: string }) => ({
        id: a.id,
        title: a.title,
      })),
    };
    if (authenticationsRes?.data) {
      body.authentications = authenticationsRes.data.map((a) => ({
        id: a.id,
        app: a.app,
        title: a.title,
        is_expired: a.is_expired,
      }));
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("Zapier apps fetch error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Zapier apps" },
      { status: 502 }
    );
  }
}
