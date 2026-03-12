import type { SupplyChainLink } from "@/lib/supply-chain-links";

type Side = "upstream" | "internal" | "downstream";

type PositionedNode = {
  id: string;
  link: SupplyChainLink;
  originalIndex: number;
  side: Side;
  x: number;
  y: number;
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 74;
const COL_X: Record<Side, number> = {
  upstream: 70,
  internal: 380,
  downstream: 690,
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function classifySide(link: SupplyChainLink): Side {
  const blob = normalizeText(`${link.type} ${link.process} ${link.purpose}`);
  if (
    /(supplier|vendor|manufacturer|tier|procurement|source|sourcing|raw material)/.test(blob)
  ) {
    return "upstream";
  }
  if (
    /(delivery|distributor|retailer|customer|3pl|logistics|shipment|transport)/.test(blob)
  ) {
    return "downstream";
  }
  return "internal";
}

function shorten(value: string, max = 34): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function groupAndPosition(links: SupplyChainLink[]): PositionedNode[] {
  const grouped: Record<Side, Array<{ link: SupplyChainLink; originalIndex: number }>> = {
    upstream: [],
    internal: [],
    downstream: [],
  };

  for (const [originalIndex, link] of links.entries()) {
    grouped[classifySide(link)].push({ link, originalIndex });
  }

  const nodes: PositionedNode[] = [];
  (["upstream", "internal", "downstream"] as Side[]).forEach((side) => {
    const col = grouped[side];
    const gap = 24;
    col.forEach(({ link, originalIndex }, index) => {
      nodes.push({
        id: `${side}-${index}-${link.name || "node"}`,
        link,
        originalIndex,
        side,
        x: COL_X[side],
        y: 70 + index * (NODE_HEIGHT + gap),
      });
    });
  });

  return nodes;
}

function buildEdges(nodes: PositionedNode[]): Array<{ from: PositionedNode; to: PositionedNode }> {
  const edges: Array<{ from: PositionedNode; to: PositionedNode }> = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const connectionBlob = normalizeText(node.link.connections);
    if (!connectionBlob) continue;
    for (const other of nodes) {
      if (other.id === node.id || !other.link.name) continue;
      const otherName = normalizeText(other.link.name);
      if (otherName.length < 3) continue;
      if (!connectionBlob.includes(otherName)) continue;
      const key = `${node.id}->${other.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: node, to: other });
      }
    }
  }

  if (edges.length > 0) return edges;

  const upstream = nodes.filter((n) => n.side === "upstream");
  const internal = nodes.filter((n) => n.side === "internal");
  const downstream = nodes.filter((n) => n.side === "downstream");
  const primaryInternal = internal[0];
  const primaryDownstream = downstream[0];

  if (primaryInternal) {
    for (const source of upstream) {
      edges.push({ from: source, to: primaryInternal });
    }
  }
  if (primaryDownstream) {
    for (const source of internal) {
      edges.push({ from: source, to: primaryDownstream });
    }
  }

  return edges;
}

type SupplyChainMapProps = {
  links: SupplyChainLink[];
  selectedIndex?: number | null;
  highlightedIndexes?: number[];
  onNodeClick?: (index: number) => void;
};

export function SupplyChainMap({
  links,
  selectedIndex = null,
  highlightedIndexes = [],
  onNodeClick,
}: SupplyChainMapProps) {
  if (!links.length) return <p className="muted text-sm">Add supply chain links to render the map.</p>;

  const nodes = groupAndPosition(links);
  const edges = buildEdges(nodes);
  const highlightedSet = new Set(highlightedIndexes);
  const maxNodesInColumn = Math.max(
    nodes.filter((n) => n.side === "upstream").length,
    nodes.filter((n) => n.side === "internal").length,
    nodes.filter((n) => n.side === "downstream").length,
    1,
  );
  const height = 120 + maxNodesInColumn * (NODE_HEIGHT + 24);

  return (
    <div className="supply-chain-map">
      <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        <span className="badge">Upstream</span>
        <span className="badge">Internal</span>
        <span className="badge">Downstream</span>
      </div>
      <svg
        className="supply-chain-map__svg"
        viewBox={`0 0 980 ${height}`}
        role="img"
        aria-label="Supply chain relationship map"
      >
        <defs>
          <marker id="supply-chain-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
        </defs>

        <text x={COL_X.upstream} y={28} className="supply-chain-map__title">Upstream</text>
        <text x={COL_X.internal} y={28} className="supply-chain-map__title">Internal</text>
        <text x={COL_X.downstream} y={28} className="supply-chain-map__title">Downstream</text>

        {edges.map((edge, index) => {
          const x1 = edge.from.x + NODE_WIDTH;
          const y1 = edge.from.y + NODE_HEIGHT / 2;
          const x2 = edge.to.x;
          const y2 = edge.to.y + NODE_HEIGHT / 2;
          const edgeIsHighlighted =
            selectedIndex == null ||
            edge.from.originalIndex === selectedIndex ||
            edge.to.originalIndex === selectedIndex ||
            (highlightedSet.has(edge.from.originalIndex) && highlightedSet.has(edge.to.originalIndex));
          return (
            <line
              key={`${edge.from.id}-${edge.to.id}-${index}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={`supply-chain-map__edge ${edgeIsHighlighted ? "is-highlighted" : "is-dimmed"}`}
              markerEnd="url(#supply-chain-arrow)"
            />
          );
        })}

        {nodes.map((node) => {
          const isSelected = selectedIndex === node.originalIndex;
          const isLinked = highlightedSet.has(node.originalIndex);
          const isDimmed = selectedIndex != null && !isSelected && !isLinked;
          return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => onNodeClick?.(node.originalIndex)}
            className={`supply-chain-map__node-wrap ${isSelected ? "is-selected" : ""} ${isDimmed ? "is-dimmed" : ""}`}
          >
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={12}
              className={`supply-chain-map__node supply-chain-map__node--${node.side}`}
            />
            <text x={12} y={25} className="supply-chain-map__node-name">
              {shorten(node.link.name || "Unnamed link")}
            </text>
            <text x={12} y={45} className="supply-chain-map__node-meta">
              {shorten([node.link.type, node.link.location].filter(Boolean).join(" - ") || "Details pending")}
            </text>
            <text x={12} y={63} className="supply-chain-map__node-meta">
              {shorten(node.link.process || node.link.purpose || "No process noted")}
            </text>
          </g>
        )})}
      </svg>
    </div>
  );
}

export function getConnectedIndexes(links: SupplyChainLink[], selectedIndex: number): number[] {
  const nodes = groupAndPosition(links);
  const edges = buildEdges(nodes);
  const connected = new Set<number>([selectedIndex]);
  for (const edge of edges) {
    if (edge.from.originalIndex === selectedIndex) connected.add(edge.to.originalIndex);
    if (edge.to.originalIndex === selectedIndex) connected.add(edge.from.originalIndex);
  }
  return Array.from(connected);
}
