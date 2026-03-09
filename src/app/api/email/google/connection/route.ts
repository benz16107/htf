import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { disconnectGoogleEmail, setGooglePushEndpointForStatus } from "@/server/email/google";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await setGooglePushEndpointForStatus(session.companyId, getRequestOrigin(request));
  return NextResponse.json(status);
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await disconnectGoogleEmail(session.companyId);
  return NextResponse.json({ success: true });
}
