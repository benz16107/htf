import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { startGmailWatch } from "@/server/email/google";

export async function POST() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await startGmailWatch(session.companyId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Gmail watch" },
      { status: 500 }
    );
  }
}
