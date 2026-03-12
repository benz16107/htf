import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";

const sectionKeys = [
  "riskClassification",
  "leadTimeSensitivity",
  "inventoryBufferPolicies",
  "contractStructures",
  "customerSLAProfile",
  "erpSignalMonitoring",
];

function getSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const summary = (value as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : "";
}

export async function GET() {
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
    data.riskClassification = getSummary(profile.existingRiskAnalysis);
    data.leadTimeSensitivity = getSummary(profile.leadTimeSensitivity);
    data.inventoryBufferPolicies = getSummary(profile.inventoryBufferPolicies);
    data.contractStructures = getSummary(profile.contractStructures);
    data.customerSLAProfile = getSummary(profile.customerSlaProfile);
    data.erpSignalMonitoring = getSummary(profile.erpSignalMonitoring);
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", origin));
  }

  const formData = await request.formData();
  const redirectTo = formData.get("redirectTo")?.toString();

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

  const wantsJson = request.headers.get("accept")?.includes("application/json");
  if (wantsJson) return NextResponse.json({ success: true });

  const nextUrl = redirectTo === "dashboard" ? "/dashboard?saved=high-level" : "/setup/review?saved=high-level";
  return NextResponse.redirect(new URL(nextUrl, origin));
}
