"use client";

import { useMemo, useState } from "react";
import type { SupplyChainLink } from "@/lib/supply-chain-links";
import { getConnectedIndexes, SupplyChainMap } from "@/components/SupplyChainMap";

function SupplyChainLinksList({
  links,
  indexesToShow,
  selectedIndex,
}: {
  links: SupplyChainLink[];
  indexesToShow: number[];
  selectedIndex: number | null;
}) {
  if (!links.length) return <p className="muted text-sm">No links configured yet.</p>;
  if (!indexesToShow.length) return <p className="muted text-sm">No linked nodes found for this selection.</p>;

  return (
    <div className="stack-sm">
      {indexesToShow.map((index) => {
        const link = links[index];
        if (!link) return null;
        const isSelected = selectedIndex === index;
        return (
          <div className={`card-flat stack-xs ${isSelected ? "supply-chain-link-card--selected" : ""}`} key={`${link.name}-${index}`}>
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              {link.name || `Link ${index + 1}`}
            </p>
            <p className="muted text-sm">{[link.type, link.process, link.location].filter(Boolean).join(" - ") || "Details pending"}</p>
            <p className="text-sm">{link.purpose || "Purpose not set."}</p>
            <p className="muted text-xs">
              Connections: {link.connections || "Not specified"}
              {link.criticality ? ` | Criticality: ${link.criticality}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function SupplyChainLinksExplorer({ links }: { links: SupplyChainLink[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const highlightedIndexes = useMemo(() => {
    if (selectedIndex == null) return [];
    return getConnectedIndexes(links, selectedIndex);
  }, [links, selectedIndex]);

  const indexesToShow = useMemo(() => {
    if (selectedIndex == null) return links.map((_, index) => index);
    return highlightedIndexes;
  }, [highlightedIndexes, links, selectedIndex]);

  return (
    <div className="stack-sm">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <p className="muted text-sm" style={{ margin: 0 }}>
          {selectedIndex == null
            ? "Click a node to focus on its local neighborhood."
            : `Focused on ${links[selectedIndex]?.name || `Link ${selectedIndex + 1}`} and connected nodes.`}
        </p>
        {selectedIndex != null ? (
          <button type="button" className="btn secondary btn-xs" onClick={() => setSelectedIndex(null)}>
            Clear focus
          </button>
        ) : null}
      </div>
      <SupplyChainMap
        links={links}
        selectedIndex={selectedIndex}
        highlightedIndexes={highlightedIndexes}
        onNodeClick={(index) => setSelectedIndex((prev) => (prev === index ? null : index))}
      />
      <SupplyChainLinksList links={links} indexesToShow={indexesToShow} selectedIndex={selectedIndex} />
    </div>
  );
}
