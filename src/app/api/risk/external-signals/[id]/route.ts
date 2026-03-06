import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * DELETE /api/risk/external-signals/[id]
 * Deletes a saved external signal. Only allowed for the signal's company.
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
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const deleted = await db.savedExternalSignal.deleteMany({
      where: {
        id,
        companyId: session.companyId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Signal not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/external-signals/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete signal" }, { status: 500 });
  }
}
