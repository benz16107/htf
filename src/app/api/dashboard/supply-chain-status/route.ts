import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseSupplyChainLinks } from "@/lib/supply-chain-links";

type NodeStatus = "healthy" | "warning" | "disrupted";
type Side = "upstream" | "internal" | "downstream";

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function classifySide(input: { type?: string; process?: string; purpose?: string }): Side {
  const blob = normalize(`${input.type || ""} ${input.process || ""} ${input.purpose || ""}`);
  if (/(supplier|vendor|manufacturer|tier|procurement|source|sourcing|raw material)/.test(blob)) {
    return "upstream";
  }
  if (/(delivery|distributor|retailer|customer|3pl|logistics|shipment|transport)/.test(blob)) {
    return "downstream";
  }
  return "internal";
}

function statusPriority(status: NodeStatus): number {
  if (status === "disrupted") return 3;
  if (status === "warning") return 2;
  return 1;
}

export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const signalWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [baseProfile, activeRiskCases, recentInternalSignals, recentExternalSignals] = await Promise.all([
    db.companyProfileBase.findUnique({
      where: { companyId: session.companyId },
      select: { stakeholderMap: true },
    }),
    db.riskCase.findMany({
      where: {
        companyId: session.companyId,
        mitigationPlans: { none: { status: { in: ["EXECUTED", "REFLECTED"] } } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        triggerType: true,
        entityMap: true,
        evidencePack: true,
        severity: true,
        createdAt: true,
      },
    }),
    db.ingestedEvent.findMany({
      where: { companyId: session.companyId, createdAt: { gte: signalWindow } },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: { id: true, signalSummary: true, rawContent: true, createdAt: true },
    }),
    db.savedExternalSignal.findMany({
      where: { companyId: session.companyId, createdAt: { gte: signalWindow } },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: { id: true, title: true, snippet: true, createdAt: true },
    }),
  ]);

  const links = parseSupplyChainLinks(baseProfile?.stakeholderMap);
  if (!links.length) {
    return NextResponse.json({
      generatedAt: now.toISOString(),
      summary: {
        totalLinks: 0,
        disrupted: 0,
        warning: 0,
        healthy: 0,
        alert: "No supply chain links configured yet.",
      },
      nodes: [],
      edges: [],
    });
  }

  const nodes = links.map((link, index) => {
    const name = normalize(link.name);
    const side = classifySide(link);
    const riskMatches = name.length >= 3
      ? activeRiskCases.filter((risk) => {
          const haystack = normalize(`${risk.triggerType} ${toText(risk.entityMap)} ${toText(risk.evidencePack)}`);
          return haystack.includes(name);
        })
      : [];

    const signalMatches = name.length >= 3
      ? [
          ...recentInternalSignals.filter((signal) => normalize(`${signal.signalSummary || ""} ${toText(signal.rawContent)}`).includes(name)),
          ...recentExternalSignals.filter((signal) => normalize(`${signal.title || ""} ${signal.snippet || ""}`).includes(name)),
        ]
      : [];

    const status: NodeStatus = riskMatches.length > 0 ? "disrupted" : signalMatches.length > 0 ? "warning" : "healthy";
    const lastSeenIso =
      riskMatches[0]?.createdAt?.toISOString() ||
      signalMatches[0]?.createdAt?.toISOString() ||
      null;

    return {
      id: `node-${index}`,
      index,
      name: link.name || `Link ${index + 1}`,
      side,
      type: link.type,
      location: link.location,
      process: link.process,
      connections: link.connections,
      status,
      disruptedCount: riskMatches.length,
      warningCount: signalMatches.length,
      lastSeenIso,
      statusReason:
        status === "disrupted"
          ? `${riskMatches.length} active risk case${riskMatches.length === 1 ? "" : "s"} mention this link`
          : status === "warning"
            ? `${signalMatches.length} recent signal${signalMatches.length === 1 ? "" : "s"} mention this link`
            : "No recent disruption signals detected",
    };
  });

  const nameIndex = new Map<string, number>();
  for (const node of nodes) {
    const n = normalize(node.name);
    if (n.length >= 3) nameIndex.set(n, node.index);
  }

  const rawEdges: Array<{ from: number; to: number; source: "explicit" | "inferred" }> = [];
  for (const node of nodes) {
    const blob = normalize(node.connections || "");
    if (!blob) continue;
    for (const [otherName, otherIndex] of nameIndex.entries()) {
      if (otherIndex === node.index) continue;
      if (blob.includes(otherName)) {
        rawEdges.push({ from: node.index, to: otherIndex, source: "explicit" });
      }
    }
  }

  if (!rawEdges.length) {
    const upstream = nodes.filter((n) => n.side === "upstream");
    const internal = nodes.filter((n) => n.side === "internal");
    const downstream = nodes.filter((n) => n.side === "downstream");
    const firstInternal = internal[0];
    const firstDownstream = downstream[0];

    if (firstInternal) {
      for (const node of upstream) rawEdges.push({ from: node.index, to: firstInternal.index, source: "inferred" });
    }
    if (firstDownstream) {
      for (const node of internal) rawEdges.push({ from: node.index, to: firstDownstream.index, source: "inferred" });
    }
  }

  const dedupe = new Set<string>();
  const edges = rawEdges
    .filter((edge) => {
      const key = `${edge.from}->${edge.to}`;
      if (dedupe.has(key)) return false;
      dedupe.add(key);
      return true;
    })
    .map((edge, idx) => {
      const fromNode = nodes[edge.from];
      const toNode = nodes[edge.to];
      const status =
        statusPriority(fromNode.status) >= statusPriority(toNode.status)
          ? fromNode.status
          : toNode.status;
      return {
        id: `edge-${idx}`,
        from: edge.from,
        to: edge.to,
        source: edge.source,
        status,
        label: `${fromNode.name} -> ${toNode.name}`,
      };
    });

  const disrupted = nodes.filter((n) => n.status === "disrupted").length;
  const warning = nodes.filter((n) => n.status === "warning").length;
  const healthy = nodes.filter((n) => n.status === "healthy").length;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      totalLinks: nodes.length,
      disrupted,
      warning,
      healthy,
      alert:
        disrupted > 0
          ? `${disrupted} link${disrupted === 1 ? "" : "s"} disrupted`
          : warning > 0
            ? `${warning} link${warning === 1 ? "" : "s"} with warning`
            : "All links healthy",
    },
    nodes,
    edges,
  });
}
