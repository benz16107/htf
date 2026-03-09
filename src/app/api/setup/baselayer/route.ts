import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { runSetupAgent } from "@/server/agents/setup-agent";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({});
  }

  const company = await db.company.findUnique({
    where: { id: session.companyId },
    include: { baseProfile: true },
  });

  return NextResponse.json({
    companyName: company?.name || "",
    sector: company?.baseProfile?.sector || "",
    companyType: company?.baseProfile?.companyType || "",
    supplyChainSummary: company?.baseProfile?.generatedSummary || "",
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const formData = await request.formData();

  const payload = {
    companyName: (formData.get("companyName")?.toString() ?? "").trim(),
    sector: (formData.get("sector")?.toString() ?? "").trim(),
    companyType: (formData.get("companyType")?.toString() ?? "").trim(),
    supplyChainSummary: (formData.get("supplyChainSummary")?.toString() ?? "").trim(),
  };

  let companyId = session.companyId;

  if (!companyId) {
    const company = await db.company.create({
      data: {
        key: `company_${crypto.randomUUID()}`,
        name: payload.companyName || "Untitled Company",
      },
    });

    await db.userCompanyRole.upsert({
      where: {
        userId_companyId: {
          userId: session.userId,
          companyId: company.id,
        },
      },
      update: {
        role: "OWNER",
      },
      create: {
        userId: session.userId,
        companyId: company.id,
        role: "OWNER",
      },
    });

    companyId = company.id;
  }

  await db.company.update({
    where: { id: companyId },
    data: {
      name: payload.companyName || "Untitled Company",
      setupCompleted: false,
    },
  });

  const setupResult = await runSetupAgent({
    companyName: payload.companyName,
    sector: payload.sector,
    companyType: payload.companyType,
    supplyChainSummary: payload.supplyChainSummary,
  });

  await db.companyProfileBase.upsert({
    where: { companyId },
    update: {
      sector: payload.sector,
      companyType: payload.companyType,
      rawInput: payload.supplyChainSummary,
      generatedSummary: setupResult.summary,
      supplyChainMap: {
        source: "manual",
        summary: payload.supplyChainSummary,
      },
      assumptions: setupResult.warnings,
    },
    create: {
      companyId,
      sector: payload.sector,
      companyType: payload.companyType,
      rawInput: payload.supplyChainSummary,
      generatedSummary: setupResult.summary,
      supplyChainMap: {
        source: "manual",
        summary: payload.supplyChainSummary,
      },
      assumptions: setupResult.warnings,
    },
  });

  const setupSession = await db.agentSession.create({
    data: {
      companyId,
      agentType: "AI_SETUP",
      status: "COMPLETED",
      metadata: {
        mode: "baselayer",
      },
    },
  });

  if (setupResult.traces.length > 0) {
    await db.reasoningTrace.createMany({
      data: setupResult.traces.map((trace) => ({
        companyId,
        sessionId: setupSession.id,
        stepKey: trace.stepKey,
        stepTitle: trace.stepKey,
        rationale: trace.rationale,
      })),
    });
  }

  const redirectTo = formData.get("redirectTo")?.toString();
  const nextUrl = redirectTo === "dashboard" ? "/dashboard?saved=baselayer" : "/setup/integrations?saved=baselayer";
  return NextResponse.redirect(new URL(nextUrl, origin));
}
