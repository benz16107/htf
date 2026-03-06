import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/risk/events
 * Returns the company's ingested events (from Zapier input-context tools) for the Signals & Risk/Impact Analysis page.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate. Then restart the dev server (stop and run npm run dev again)." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

    const events = await (db as unknown as { ingestedEvent: { findMany: (args: object) => Promise<Array<{ id: string; source: string; toolName: string; signalSummary: string | null; createdAt: Date }>> } }).ingestedEvent.findMany({
      where: { companyId: session.companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        toolName: true,
        signalSummary: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        source: e.source,
        toolName: e.toolName,
        signal: e.signalSummary || "(no summary)",
        time: e.createdAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/risk/events error:", err);
    return NextResponse.json(
      { error: "Could not load events. Run `npx prisma generate` if you recently added the IngestedEvent table." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/risk/events
 * Deletes all ingested events for the current company.
 */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate and restart the dev server." },
        { status: 503 }
      );
    }

    await (db as unknown as { ingestedEvent: { deleteMany: (args: { where: { companyId: string } }) => Promise<unknown> } }).ingestedEvent.deleteMany({
      where: { companyId: session.companyId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/events error:", err);
    return NextResponse.json({ error: "Failed to delete events" }, { status: 500 });
  }
}
