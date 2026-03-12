import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGeminiModelId } from "@/lib/gemini-models";
import { getRequestOrigin } from "@/lib/request-origin";
import { saveGeminiModelForCompany } from "@/server/gemini-model-preference";
import { saveZapierMCPToolSelections } from "@/server/zapier/mcp-config";

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);
  const wantsJson = request.headers.get("accept")?.includes("application/json");

  if (!session?.companyId) {
    if (wantsJson) {
      return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/dashboard", origin));
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

  if (wantsJson) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.redirect(new URL("/dashboard/integrations", origin));
}
