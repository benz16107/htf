import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * DELETE /api/risk/cases/[id]
 * Deletes a risk case and its scenarios and mitigation plans. Only allowed for the case's company.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing risk case id" }, { status: 400 });
    }

    const riskCase = await db.riskCase.findFirst({
      where: { id, companyId: session.companyId },
    });

    if (!riskCase) {
      return NextResponse.json({ error: "Risk case not found" }, { status: 404 });
    }

    await db.riskCase.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/risk/cases/[id] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete mitigation plan" },
      { status: 500 }
    );
  }
}
