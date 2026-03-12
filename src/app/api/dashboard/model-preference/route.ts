import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGeminiModelId } from "@/lib/gemini-models";
import { saveGeminiModelForCompany } from "@/server/gemini-model-preference";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedGeminiModel = typeof body?.geminiModel === "string" ? body.geminiModel.trim() : "";

  if (!isGeminiModelId(requestedGeminiModel)) {
    return NextResponse.json({ success: false, error: "Invalid model." }, { status: 400 });
  }

  await saveGeminiModelForCompany(session.companyId, requestedGeminiModel);
  return NextResponse.json({ success: true });
}
