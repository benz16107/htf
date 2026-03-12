import { db } from "@/lib/db";
import {
  isGeminiModelId,
  type GeminiModelId,
} from "@/lib/gemini-models";

const PREFERENCE_PROVIDER = "gemini_model";

function getDefaultGeminiModel(): GeminiModelId {
  const envModel = (process.env.GEMINI_MODEL || "").trim();
  if (isGeminiModelId(envModel)) return envModel;
  return "gemini-2.5-flash";
}

export async function getGeminiModelForCompany(companyId?: string | null): Promise<GeminiModelId> {
  if (!companyId) return getDefaultGeminiModel();

  const row = await db.integrationConnection.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: PREFERENCE_PROVIDER,
      },
    },
    select: { metadata: true },
  });

  const model = (row?.metadata as { model?: unknown } | null)?.model;
  if (typeof model === "string" && isGeminiModelId(model)) return model;

  return getDefaultGeminiModel();
}

export async function saveGeminiModelForCompany(
  companyId: string,
  model: GeminiModelId,
): Promise<void> {
  await db.integrationConnection.upsert({
    where: {
      companyId_provider: {
        companyId,
        provider: PREFERENCE_PROVIDER,
      },
    },
    update: {
      status: "CONNECTED",
      authType: "preference",
      metadata: { model },
      lastSyncAt: new Date(),
    },
    create: {
      companyId,
      provider: PREFERENCE_PROVIDER,
      status: "CONNECTED",
      authType: "preference",
      metadata: { model },
      lastSyncAt: new Date(),
    },
  });
}
