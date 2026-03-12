import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  buildSupplyChainLinksPayload,
  parseSupplyChainLinks,
  type SupplyChainLink,
} from "@/lib/supply-chain-links";

function collectLinksFromFormData(formData: FormData): SupplyChainLink[] {
  const names = formData.getAll("linkName").map((value) => value.toString());
  const types = formData.getAll("linkType").map((value) => value.toString());
  const purposes = formData.getAll("linkPurpose").map((value) => value.toString());
  const connections = formData.getAll("linkConnections").map((value) => value.toString());
  const processes = formData.getAll("linkProcess").map((value) => value.toString());
  const locations = formData.getAll("linkLocation").map((value) => value.toString());
  const criticalities = formData.getAll("linkCriticality").map((value) => value.toString());
  const notes = formData.getAll("linkNotes").map((value) => value.toString());

  const maxRows = Math.max(
    names.length,
    types.length,
    purposes.length,
    connections.length,
    processes.length,
    locations.length,
    criticalities.length,
    notes.length,
  );

  const rows: SupplyChainLink[] = [];
  for (let index = 0; index < maxRows; index += 1) {
    rows.push({
      name: names[index] ?? "",
      type: types[index] ?? "",
      purpose: purposes[index] ?? "",
      connections: connections[index] ?? "",
      process: processes[index] ?? "",
      location: locations[index] ?? "",
      criticality: criticalities[index] ?? "",
      notes: notes[index] ?? "",
    });
  }

  return parseSupplyChainLinks({ links: rows });
}

export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ links: [] });
  }

  const profile = await db.companyProfileBase.findUnique({
    where: { companyId: session.companyId },
    select: {
      stakeholderMap: true,
    },
  });

  return NextResponse.json({
    links: parseSupplyChainLinks(profile?.stakeholderMap),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  const origin = getRequestOrigin(request);

  if (!session?.companyId) {
    return NextResponse.redirect(new URL("/setup/baselayer", origin));
  }

  const formData = await request.formData();
  const redirectTo = formData.get("redirectTo")?.toString();
  const aiPrompt = formData.get("aiPrompt")?.toString();
  const generationSource = formData.get("generationSource")?.toString() === "ai" ? "ai" : "manual";
  const links = collectLinksFromFormData(formData);

  await db.companyProfileBase.upsert({
    where: { companyId: session.companyId },
    update: {
      stakeholderMap: buildSupplyChainLinksPayload(links, generationSource, aiPrompt),
    },
    create: {
      companyId: session.companyId,
      stakeholderMap: buildSupplyChainLinksPayload(links, generationSource, aiPrompt),
    },
  });

  const nextUrl =
    redirectTo === "dashboard"
      ? "/dashboard?saved=stakeholders"
      : "/setup/high-level?saved=stakeholders";
  return NextResponse.redirect(new URL(nextUrl, origin));
}
