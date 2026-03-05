import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const sectionKeys = [
  "riskClassification",
  "leadTimeSensitivity",
  "inventoryBufferPolicies",
  "contractStructures",
  "customerSLAProfile",
  "erpSignalMonitoring",
];

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({});
  }

  const profile = await db.companyProfileHighLevel.findUnique({
    where: { companyId: session.companyId },
    select: {
      existingRiskAnalysis: true,
      leadTimeSensitivity: true,
      inventoryBufferPolicies: true,
      contractStructures: true,
      customerSlaProfile: true,
      erpSignalMonitoring: true,
    },
  });

  const data: Record<string, string> = {};
  if (profile) {
    data.riskClassification = ((profile.existingRiskAnalysis as any)?.summary) || "";
    data.leadTimeSensitivity = ((profile.leadTimeSensitivity as any)?.summary) || "";
    data.inventoryBufferPolicies = ((profile.inventoryBufferPolicies as any)?.summary) || "";
    data.contractStructures = ((profile.contractStructures as any)?.summary) || "";
    data.customerSLAProfile = ((profile.customerSlaProfile as any)?.summary) || "";
    data.erpSignalMonitoring = ((profile.erpSignalMonitoring as any)?.summary) || "";
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", request.url));
  }

  const formData = await request.formData();

  const values = formData
    .getAll("sections")
    .map((item) => item.toString().trim())
    .slice(0, sectionKeys.length);

  const payload = sectionKeys.reduce<Record<string, string>>((acc, key, index) => {
    acc[key] = values[index] ?? "";
    return acc;
  }, {});

  await db.companyProfileHighLevel.upsert({
    where: { companyId: session.companyId },
    update: {
      existingRiskAnalysis: {
        summary: payload.riskClassification,
      },
      leadTimeSensitivity: {
        summary: payload.leadTimeSensitivity,
      },
      inventoryBufferPolicies: {
        summary: payload.inventoryBufferPolicies,
      },
      contractStructures: {
        summary: payload.contractStructures,
      },
      customerSlaProfile: {
        summary: payload.customerSLAProfile,
      },
      erpSignalMonitoring: {
        summary: payload.erpSignalMonitoring,
      },
      generatedNarrative: JSON.stringify(payload),
      warningSummary: "",
      confidenceScore: "medium",
    },
    create: {
      companyId: session.companyId,
      existingRiskAnalysis: {
        summary: payload.riskClassification,
      },
      leadTimeSensitivity: {
        summary: payload.leadTimeSensitivity,
      },
      inventoryBufferPolicies: {
        summary: payload.inventoryBufferPolicies,
      },
      contractStructures: {
        summary: payload.contractStructures,
      },
      customerSlaProfile: {
        summary: payload.customerSLAProfile,
      },
      erpSignalMonitoring: {
        summary: payload.erpSignalMonitoring,
      },
      generatedNarrative: JSON.stringify(payload),
      warningSummary: "",
      confidenceScore: "medium",
    },
  });

  return NextResponse.redirect(new URL("/setup/review", request.url));
}
