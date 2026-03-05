import { db } from "@/lib/db";

type SetupSnapshot = {
  baselayer: Record<string, string> | null;
  integrations: { connectors: string[] };
  highLevel: Record<string, string> | null;
};

function extractJsonSummary(input: unknown): string {
  if (!input || typeof input !== "object") {
    return "";
  }

  if ("summary" in input && typeof (input as { summary?: unknown }).summary === "string") {
    return (input as { summary: string }).summary;
  }

  return JSON.stringify(input);
}

export async function getCompanySetupSnapshot(
  companyId: string,
): Promise<SetupSnapshot> {
  const [company, base, highLevel, integrations] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    }),
    db.companyProfileBase.findUnique({
      where: { companyId },
    }),
    db.companyProfileHighLevel.findUnique({
      where: { companyId },
    }),
    db.integrationConnection.findMany({
      where: { companyId },
      orderBy: { provider: "asc" },
      select: { provider: true },
    }),
  ]);

  return {
    baselayer: base
      ? {
          companyName: company?.name ?? "",
          sector: base.sector ?? "",
          companyType: base.companyType ?? "",
          setupSummary: base.generatedSummary ?? "",
          supplyChainSummary: base.rawInput ?? "",
        }
      : null,
    integrations: {
      connectors: integrations.map((item: { provider: string }) => item.provider),
    },
    highLevel: highLevel
      ? {
          riskClassification: extractJsonSummary(highLevel.existingRiskAnalysis),
          leadTimeSensitivity: extractJsonSummary(highLevel.leadTimeSensitivity),
          inventoryBufferPolicies: extractJsonSummary(highLevel.inventoryBufferPolicies),
          contractStructures: extractJsonSummary(highLevel.contractStructures),
          customerSLAProfile: extractJsonSummary(highLevel.customerSlaProfile),
          erpSignalMonitoring: extractJsonSummary(highLevel.erpSignalMonitoring),
        }
      : null,
  };
}
