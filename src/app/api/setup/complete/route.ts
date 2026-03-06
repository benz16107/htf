import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", origin));
  }

  await db.company.update({
    where: { id: session.companyId },
    data: { setupCompleted: true },
  });

  return NextResponse.redirect(new URL("/dashboard", origin));
}
