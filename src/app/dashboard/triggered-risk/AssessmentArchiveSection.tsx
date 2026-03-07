"use client";

import { useState } from "react";
import type { ArchivedOutput } from "./types";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Probability may be stored as 0–1 or 0–100; return 0–100 for display */
function toPercent(n: number): number {
  if (n > 1) return Math.min(100, Math.max(0, n));
  return Math.min(100, Math.max(0, n * 100));
}

function severityColor(severity: string | undefined): { border: string; text: string } {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical") return { border: "var(--danger)", text: "var(--danger)" };
  if (s === "severe") return { border: "var(--warning)", text: "var(--warning)" };
  if (s === "moderate") return { border: "var(--caution)", text: "var(--caution)" };
  return { border: "var(--muted)", text: "var(--muted)" };
}

type Props = {
  archived: ArchivedOutput[];
  onReaddToActive?: (output: ArchivedOutput) => void;
  onClearArchive?: () => void;
  onDeleteItem?: (id: string) => void;
};

export function AssessmentArchiveSection({ archived, onReaddToActive, onClearArchive, onDeleteItem }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Newest first
  const sorted = [...archived].sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1));

  return (
    <section className="card stack">
      <div className="row between" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0 }}>Archive</h3>
          <p className="muted text-sm" style={{ margin: "0.25rem 0 0 0" }}>
        Sent to mitigation. Readd to send again.
          </p>
        </div>
        {onClearArchive && archived.length > 0 && (
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={onClearArchive}
            title="Remove all items from the archive"
          >
            Delete archive
          </button>
        )}
      </div>
      <div className="stack-sm">
        {archived.length === 0 ? (
          <p className="muted text-sm" style={{ margin: 0 }}>No items in archive.</p>
        ) : sorted.map((out) => {
          const a = out.assessment;
          const prob = a?.probability;
          const impact = a?.impact;
          const fin = a?.financialImpact;
          const tw = out.timeWindow;
          const isExpanded = expandedId === out.id;

          const sevColor = severityColor(impact?.severity);
          return (
            <div
              key={out.id}
              className="card-flat stack-sm"
              style={{ padding: "0.75rem 1rem", borderLeftWidth: 3, borderLeftColor: sevColor.border }}
            >
              <div className="row between start gap-xs">
                <div className="stack-xs">
                  <div className="row gap-xs" style={{ alignItems: "center", flexWrap: "wrap" }}>
                    <span className="font-semibold text-sm">{out.issueTitle ?? out.triggerType}</span>
                    {out.source === "autonomous" && (
                      <span
                        className="text-xs"
                        style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: 4,
                          background: "var(--warning-soft)",
                          color: "var(--warning)",
                        }}
                        title="Created by autonomous agent"
                      >
                        Autonomous
                      </span>
                    )}
                  </div>
                  <div className="row text-xs muted" style={{ gap: "0.75rem" }}>
                    {out.assessedAt && (
                      <span title={out.assessedAt}>Assessed {formatDate(out.assessedAt)}</span>
                    )}
                    <span title={out.sentAt}>Sent to mitigation {formatDate(out.sentAt)}</span>
                  </div>
                </div>
                <div className="row gap-xs">
                  {onReaddToActive && (
                    <button
                      type="button"
                      className="btn primary btn-sm"
                      onClick={() => onReaddToActive(out)}
                    >
                      Readd to active
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => setExpandedId(isExpanded ? null : out.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? "Hide details" : "Show details"}
                  </button>
                  {onDeleteItem && (
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() => onDeleteItem(out.id)}
                      title="Remove from archive"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="row start" style={{ gap: "1rem", marginTop: "0.5rem" }}>
                  {impact?.severity && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Severity</p>
                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0", textTransform: "uppercase", color: sevColor.text }}>{String(impact.severity)}</p>
                    </div>
                  )}
                  {(prob?.pointEstimate != null || (prob?.bandLow != null && prob?.bandHigh != null)) && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Probability</p>
                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                        {prob?.pointEstimate != null
                          ? `${toPercent(prob.pointEstimate).toFixed(0)}%`
                          : prob?.bandLow != null && prob?.bandHigh != null
                            ? `${toPercent(prob.bandLow).toFixed(0)}–${toPercent(prob.bandHigh).toFixed(0)}%`
                            : "—"}
                      </p>
                    </div>
                  )}
                  {fin && (fin.revenueAtRiskUsd != null || fin.marginErosionPercent != null) && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Financial impact</p>
                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                        {fin.revenueAtRiskUsd != null && `$${Number(fin.revenueAtRiskUsd).toLocaleString()} at risk`}
                        {fin.revenueAtRiskUsd != null && fin.marginErosionPercent != null && " · "}
                        {fin.marginErosionPercent != null && `${fin.marginErosionPercent}% margin erosion`}
                      </p>
                    </div>
                  )}
                  {(tw?.startDate || tw?.expectedDurationDays != null) && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Time window</p>
                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                        {tw?.startDate && String(tw.startDate)}
                        {tw?.expectedDurationDays != null && ` · ${tw.expectedDurationDays} days`}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {isExpanded && (Array.isArray(a?.keyStakeholders) && a.keyStakeholders.length > 0 || Array.isArray(a?.potentialLosses) && a.potentialLosses.length > 0) && (
                <div className="stack-xs" style={{ marginTop: "0.75rem" }}>
                  {Array.isArray(a?.keyStakeholders) && a.keyStakeholders.length > 0 && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: "0 0 0.25rem 0" }}>Key stakeholders</p>
                      <ul className="text-sm list-disc" style={{ margin: 0 }}>
                        {a.keyStakeholders.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(a?.potentialLosses) && a.potentialLosses.length > 0 && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: "0 0 0.25rem 0" }}>Potential losses</p>
                      <ul className="text-sm list-disc" style={{ margin: 0 }}>
                        {a.potentialLosses.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
