import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/risk/events/[id]
 * Returns a single ingested event (including rawContent) for details views.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate and restart the dev server." },
        { status: 503 }
      );
    }

    const event = await db.ingestedEvent.findFirst({
      where: { id, companyId: session.companyId },
      select: {
        id: true,
        source: true,
        toolName: true,
        signalSummary: true,
        rawContent: true,
        createdAt: true,
        externalId: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({
      event: {
        id: event.id,
        source: event.source,
        toolName: event.toolName,
        signal: event.signalSummary || "(no summary)",
        rawContent: event.rawContent,
        externalId: event.externalId,
        time: event.createdAt,
      },
    });
  } catch (err) {
    console.error("GET /api/risk/events/[id] error:", err);
    return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
  }
}

/**
 * DELETE /api/risk/events/[id]
 * Deletes a single ingested event. Only allowed for the event's company.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    if (typeof (db as { ingestedEvent?: unknown }).ingestedEvent === "undefined") {
      return NextResponse.json(
        { error: "Prisma client out of date. Run: npx prisma generate and restart the dev server." },
        { status: 503 }
      );
    }

    const deleted = await db.ingestedEvent.deleteMany({
      where: {
        id,
        companyId: session.companyId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Event not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/events/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
