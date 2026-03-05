import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";

const manualTriggerSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  triggerType: z.enum([
    "logistics",
    "supplier",
    "geopolitical",
    "climate",
    "cyber",
    "labor",
    "demand_shock",
  ]),
  expectedDurationDays: z.number().int().positive().max(365),
});

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.companyId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const payload = manualTriggerSchema.safeParse(body);

  if (!payload.success) {
    return NextResponse.json(
      { message: "Invalid payload", issues: payload.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      message: "Manual risk trigger accepted.",
      status: "queued",
      riskCasePreview: {
        incidentId: crypto.randomUUID(),
        ...payload.data,
      },
    },
    { status: 202 },
  );
}
