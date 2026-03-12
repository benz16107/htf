"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBanner } from "@/components/StatusBanner";

type NodeStatus = "healthy" | "warning" | "disrupted";
type Side = "upstream" | "internal" | "downstream";

type StatusNode = {
  id: string;
  index: number;
  name: string;
  side: Side;
  type: string;
  location: string;
  process: string;
  status: NodeStatus;
  statusReason: string;
};

type StatusEdge = {
  id: string;
  from: number;
  to: number;
  source: "explicit" | "inferred";
  status: NodeStatus;
  label: string;
};

type StatusPayload = {
  generatedAt: string;
  summary: {
    totalLinks: number;
    disrupted: number;
    warning: number;
    healthy: number;
    alert: string;
  };
  nodes: StatusNode[];
  edges: StatusEdge[];
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 66;
const X_BY_SIDE: Record<Side, number> = {
  upstream: 70,
  internal: 355,
  downstream: 640,
};

function formatRelative(iso?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function statusClass(status: NodeStatus): string {
  if (status === "disrupted") return "danger";
  if (status === "warning") return "warning";
  return "success";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

// Orthogonal elbow connector with rounded corners and lane bundling.
function buildFlowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bundleOffset: number,
): string {
  const minLanePadding = 42;
  const laneX = Math.max(x1 + minLanePadding, Math.min(x2 - minLanePadding, (x1 + x2) / 2 + bundleOffset * 1.5));
  const deltaY = y2 - y1;
  const cornerRadius = Math.min(12, Math.max(4, Math.abs(deltaY) / 3));

  if (Math.abs(deltaY) < 2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const dir = deltaY > 0 ? 1 : -1;
  const turnOutY = y1 + dir * cornerRadius;
  const turnInY = y2 - dir * cornerRadius;

  return [
    `M ${x1} ${y1}`,
    `L ${laneX - cornerRadius} ${y1}`,
    `Q ${laneX} ${y1}, ${laneX} ${turnOutY}`,
    `L ${laneX} ${turnInY}`,
    `Q ${laneX} ${y2}, ${laneX + cornerRadius} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

export function OverviewSupplyChainStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const fetchStatus = useCallback(async (manual: boolean) => {
    setError(null);
    if (manual) setSyncing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/dashboard/supply-chain-status");
      const payload = (await res.json()) as StatusPayload | { error?: string };
      if (!res.ok) throw new Error((payload as { error?: string }).error || "Failed to load status");
      setData(payload as StatusPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus(false);
    const timer = window.setInterval(() => void fetchStatus(false), 30_000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  const nodesBySide = useMemo(() => {
    const bySide: Record<Side, StatusNode[]> = { upstream: [], internal: [], downstream: [] };
    for (const node of data?.nodes || []) bySide[node.side].push(node);
    return bySide;
  }, [data]);

  const positionedNodes = useMemo(() => {
    const out: Array<StatusNode & { x: number; y: number }> = [];
    (["upstream", "internal", "downstream"] as Side[]).forEach((side) => {
      nodesBySide[side].forEach((node, idx) => {
        out.push({ ...node, x: X_BY_SIDE[side], y: 68 + idx * (NODE_HEIGHT + 22) });
      });
    });
    return out;
  }, [nodesBySide]);

  const nodeByIndex = useMemo(() => {
    const map = new Map<number, StatusNode & { x: number; y: number }>();
    for (const node of positionedNodes) map.set(node.index, node);
    return map;
  }, [positionedNodes]);

  const edgeBundleOffsetById = useMemo(() => {
    const offsets = new Map<string, number>();
    if (!data) return offsets;
    const buckets = new Map<string, StatusEdge[]>();
    for (const edge of data.edges) {
      const from = nodeByIndex.get(edge.from);
      const to = nodeByIndex.get(edge.to);
      if (!from || !to) continue;
      const laneKey = `${from.side}->${to.side}`;
      const list = buckets.get(laneKey) ?? [];
      list.push(edge);
      buckets.set(laneKey, list);
    }

    for (const list of buckets.values()) {
      list.sort((a, b) => {
        const aFrom = nodeByIndex.get(a.from);
        const aTo = nodeByIndex.get(a.to);
        const bFrom = nodeByIndex.get(b.from);
        const bTo = nodeByIndex.get(b.to);
        const aMid = ((aFrom?.y ?? 0) + (aTo?.y ?? 0)) / 2;
        const bMid = ((bFrom?.y ?? 0) + (bTo?.y ?? 0)) / 2;
        return aMid - bMid;
      });
      const step = 6;
      const center = (list.length - 1) / 2;
      list.forEach((edge, idx) => {
        offsets.set(edge.id, (idx - center) * step);
      });
    }

    return offsets;
  }, [data, nodeByIndex]);

  const connectedIndexes = useMemo(() => {
    if (selectedIndex == null || !data) return new Set<number>();
    const set = new Set<number>([selectedIndex]);
    for (const edge of data.edges) {
      if (edge.from === selectedIndex) set.add(edge.to);
      if (edge.to === selectedIndex) set.add(edge.from);
    }
    return set;
  }, [data, selectedIndex]);

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    if (selectedIndex == null) return data.edges;
    return data.edges.filter((edge) => connectedIndexes.has(edge.from) || connectedIndexes.has(edge.to));
  }, [connectedIndexes, data, selectedIndex]);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    if (selectedIndex == null) return data.nodes;
    return data.nodes.filter((node) => connectedIndexes.has(node.index));
  }, [connectedIndexes, data, selectedIndex]);

  const maxCol = Math.max(
    nodesBySide.upstream.length,
    nodesBySide.internal.length,
    nodesBySide.downstream.length,
    1,
  );
  const svgHeight = 118 + maxCol * (NODE_HEIGHT + 22);

  return (
    <section className="card stack overview-supply" data-status={data?.summary.disrupted ? "disrupted" : data?.summary.warning ? "warning" : "healthy"}>
      <div className="row between" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="stack-xs">
          <h3 style={{ margin: 0 }}>Supply chain connection status</h3>
          <p className="muted text-sm" style={{ margin: 0 }}>
            Live link health and disruptions across supplier-to-delivery flow.
          </p>
        </div>
        <div className="row gap-xs" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <span className="text-xs muted">Updated {formatRelative(data?.generatedAt)}</span>
          <button type="button" className="btn secondary btn-sm" onClick={() => void fetchStatus(true)} disabled={syncing}>
            {syncing ? "Syncing…" : "Refresh"}
          </button>
          <Link href="/setup/stakeholders" className="btn secondary btn-sm">
            Edit links
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}

      {data?.summary.disrupted ? (
        <StatusBanner
          variant="error"
          title="Disruptions detected"
          message={`${data.summary.disrupted} link${data.summary.disrupted === 1 ? "" : "s"} currently disrupted. Investigate affected connections below.`}
        />
      ) : null}
      {!data?.summary.disrupted && data?.summary.warning ? (
        <StatusBanner
          variant="info"
          title="Warning signals detected"
          message={`${data.summary.warning} link${data.summary.warning === 1 ? "" : "s"} showing early warning signals.`}
        />
      ) : null}

      {loading ? (
        <p className="muted text-sm">Loading supply chain status…</p>
      ) : data && data.summary.totalLinks === 0 ? (
        <p className="muted text-sm">
          No supply chain links configured yet. Add stakeholders in setup to enable live connection monitoring.
        </p>
      ) : (
        <>
          <div className="row gap-xs" style={{ flexWrap: "wrap" }}>
            <span className="badge success">{data?.summary.healthy ?? 0} healthy</span>
            <span className="badge warning">{data?.summary.warning ?? 0} warning</span>
            <span className="badge danger">{data?.summary.disrupted ?? 0} disrupted</span>
            {selectedIndex != null ? (
              <button type="button" className="btn secondary btn-xs" onClick={() => setSelectedIndex(null)}>
                Clear focus
              </button>
            ) : null}
          </div>

          <div className="overview-supply__map-wrap">
            <svg className="overview-supply__map" viewBox={`0 0 920 ${svgHeight}`} role="img" aria-label="Live supply chain status map">
              <defs>
                <marker id="overview-supply-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              <text className="overview-supply__lane-title" x={X_BY_SIDE.upstream} y={26}>Upstream</text>
              <text className="overview-supply__lane-title" x={X_BY_SIDE.internal} y={26}>Internal</text>
              <text className="overview-supply__lane-title" x={X_BY_SIDE.downstream} y={26}>Downstream</text>

              {data?.edges.map((edge) => {
                const from = nodeByIndex.get(edge.from);
                const to = nodeByIndex.get(edge.to);
                if (!from || !to) return null;
                const dimmed =
                  selectedIndex != null &&
                  !connectedIndexes.has(from.index) &&
                  !connectedIndexes.has(to.index);
                const x1 = from.x + NODE_WIDTH;
                const y1 = from.y + NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_HEIGHT / 2;
                const bundleOffset = edgeBundleOffsetById.get(edge.id) ?? 0;
                return (
                  <path
                    key={edge.id}
                    d={buildFlowPath(x1, y1, x2, y2, bundleOffset)}
                    markerEnd="url(#overview-supply-arrow)"
                    className={`overview-supply__edge is-${edge.status} ${edge.source === "inferred" ? "is-inferred" : "is-explicit"} ${dimmed ? "is-dimmed" : ""}`}
                  />
                );
              })}

              {positionedNodes.map((node) => {
                const selected = selectedIndex === node.index;
                const dimmed = selectedIndex != null && !connectedIndexes.has(node.index);
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className={`overview-supply__node-wrap ${dimmed ? "is-dimmed" : ""} ${selected ? "is-selected" : ""}`}
                    onClick={() => setSelectedIndex((prev) => (prev === node.index ? null : node.index))}
                  >
                    <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={11} className={`overview-supply__node is-${node.status}`} />
                    <title>
                      {node.name}
                      {"\n"}
                      {[node.type, node.location].filter(Boolean).join(" · ")}
                      {"\n"}
                      {node.statusReason}
                    </title>
                    <text className="overview-supply__node-name" x={10} y={24}>{truncate(node.name, 25)}</text>
                    <text className="overview-supply__node-meta" x={10} y={43}>
                      {truncate(([node.type, node.location].filter(Boolean).join(" · ") || "Details pending"), 34)}
                    </text>
                    <text className="overview-supply__node-meta" x={10} y={59}>{truncate(node.statusReason, 34)}</text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="stack-sm">
            <h4 style={{ margin: 0 }} className="text-sm">Connection status</h4>
            {filteredEdges.length === 0 ? (
              <p className="muted text-sm">No direct connections inferred yet. Add link connections in setup for richer monitoring.</p>
            ) : (
              <div className="stack-xs">
                {filteredEdges.map((edge) => (
                  <div key={edge.id} className="list-row">
                    <span className="text-sm overview-supply__edge-label" title={edge.label}>{edge.label}</span>
                    <span className={`badge ${statusClass(edge.status)}`}>{edge.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stack-sm">
            <h4 style={{ margin: 0 }} className="text-sm">Focused links</h4>
            <div className="stack-xs">
              {filteredNodes.map((node) => (
                <div key={node.id} className="card-flat">
                  <div className="row between" style={{ alignItems: "center", gap: "0.5rem" }}>
                    <span className="text-sm font-medium overview-supply__node-title" title={node.name}>{node.name}</span>
                    <span className={`badge ${statusClass(node.status)}`}>{node.status}</span>
                  </div>
                  <p className="text-xs muted overview-supply__node-reason" style={{ margin: "0.25rem 0 0 0" }}>{node.statusReason}</p>
                </div>
              ))}
            </div>
            <Link href="/dashboard/triggered-risk" className="btn secondary btn-sm" style={{ width: "fit-content" }}>
              Investigate disruptions
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
