import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGeminiModelId } from "@/lib/gemini-models";
import { getRequestOrigin } from "@/lib/request-origin";
import { saveGeminiModelForCompany } from "@/server/gemini-model-preference";
import { saveZapierMCPToolSelections } from "@/server/zapier/mcp-config";

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", origin));
  }

  const formData = await request.formData();
  const inputContextTools = formData
    .getAll("inputContextTools")
    .map((item) => item.toString())
    .filter((s) => s && s !== "zapier_mcp");
  const executionTools = formData
    .getAll("executionTools")
    .map((item) => item.toString())
    .filter((s) => s && s !== "zapier_mcp");

  await saveZapierMCPToolSelections(session.companyId, {
    inputContextTools,
    executionTools,
  });
  const requestedGeminiModel = formData.get("geminiModel")?.toString().trim() || "";
  if (isGeminiModelId(requestedGeminiModel)) {
    await saveGeminiModelForCompany(session.companyId, requestedGeminiModel);
  }

  const redirectTo = formData.get("redirectTo")?.toString();
  const nextUrl = redirectTo === "dashboard" ? "/dashboard?saved=integrations" : "/setup/stakeholders?saved=integrations";
  return NextResponse.redirect(new URL(nextUrl, origin));
}
