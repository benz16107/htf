import { db } from "@/lib/db";
import { getZapierMCPToolSelections } from "@/server/zapier/mcp-config";

type SetupSnapshot = {
  baselayer: Record<string, string> | null;
  integrations: { inputContextTools: string[]; executionTools: string[]; connectors: string[] };
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
  const [company, base, highLevel, toolSelections] = await Promise.all([
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
    getZapierMCPToolSelections(companyId),
  ]);

  const allConnectors = [
    ...new Set([...toolSelections.inputContextTools, ...toolSelections.executionTools]),
  ];

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
      inputContextTools: toolSelections.inputContextTools,
      executionTools: toolSelections.executionTools,
      connectors: allConnectors,
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
