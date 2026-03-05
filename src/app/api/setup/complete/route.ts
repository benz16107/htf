import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", request.url));
  }

  await db.company.update({
    where: { id: session.companyId },
    data: { setupCompleted: true },
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
