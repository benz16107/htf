import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const formData = await request.formData();
  const connectors = formData
    .getAll("connectors")
    .map((item) => item.toString())
    .filter(Boolean);

  await db.integrationConnection.deleteMany({
    where: {
      companyId: session.companyId,
      provider: { not: "zapier_mcp" },
    },
  });

  if (connectors.length > 0) {
    await db.integrationConnection.createMany({
      data: connectors.map((provider) => ({
        companyId: session.companyId as string,
        provider,
        status: "connected",
        authType: "oauth",
        metadata: { source: "dashboard" },
      })),
    });
  }

  return NextResponse.redirect(new URL("/dashboard/integrations", request.url));
}
