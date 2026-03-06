import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PATCH /api/mitigation-plans/[id]
 * Updates a draft mitigation plan (actions). Only allowed for DRAFTED plans belonging to the company.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing plan id" }, { status: 400 });
    }

    const plan = await db.mitigationPlan.findFirst({
      where: { id, companyId: session.companyId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.status !== "DRAFTED") {
      return NextResponse.json(
        { error: "Only draft plans can be edited" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const actions = body.actions;
    if (!Array.isArray(actions)) {
      return NextResponse.json(
        { error: "Missing or invalid actions array" },
        { status: 400 }
      );
    }

    const updated = await db.mitigationPlan.update({
      where: { id },
      data: { actions },
    });

    return NextResponse.json({ success: true, plan: updated });
  } catch (err) {
    console.error("PATCH /api/mitigation-plans/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mitigation-plans/[id]
 * Deletes a draft mitigation plan. Only allowed for DRAFTED plans belonging to the company.
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
      return NextResponse.json({ error: "Missing plan id" }, { status: 400 });
    }

    const plan = await db.mitigationPlan.findFirst({
      where: { id, companyId: session.companyId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.status !== "DRAFTED") {
      return NextResponse.json(
        { error: "Only draft plans can be deleted" },
        { status: 400 }
      );
    }

    await db.mitigationPlan.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/mitigation-plans/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete plan" },
      { status: 500 }
    );
  }
}
