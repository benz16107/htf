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

type Props = {
  archived: ArchivedOutput[];
  onReaddToActive?: (output: ArchivedOutput) => void;
};

export function AssessmentArchiveSection({ archived, onReaddToActive }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (archived.length === 0) return null;

  // Newest first
  const sorted = [...archived].sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1));

  return (
    <section className="card stack">
      <h3>Archive (sent to mitigation)</h3>
      <p className="muted text-sm" style={{ margin: 0 }}>
        Assessments you’ve sent to mitigation. You can readd one to active outputs to send again or review.
      </p>
      <div className="stack-sm">
        {sorted.map((out) => {
          const a = out.assessment;
          const prob = a?.probability;
          const impact = a?.impact;
          const fin = a?.financialImpact;
          const tw = out.timeWindow;
          const isExpanded = expandedId === out.id;

          return (
            <div
              key={out.id}
              className="card-flat stack-sm"
              style={{ padding: "0.75rem 1rem", borderLeftWidth: 3, borderLeftColor: "var(--muted)" }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                <div className="stack-xs">
                  <span className="font-semibold text-sm">{out.issueTitle ?? out.triggerType}</span>
                  <div className="row text-xs muted" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                    {out.assessedAt && (
                      <span title={out.assessedAt}>Assessed {formatDate(out.assessedAt)}</span>
                    )}
                    <span title={out.sentAt}>Sent to mitigation {formatDate(out.sentAt)}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: "0.5rem" }}>
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
                </div>
              </div>

              {isExpanded && (
                <div className="row" style={{ flexWrap: "wrap", gap: "1rem", alignItems: "flex-start", marginTop: "0.5rem" }}>
                  {impact?.severity && (
                    <div>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Severity</p>
                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0", textTransform: "uppercase" }}>{String(impact.severity)}</p>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
