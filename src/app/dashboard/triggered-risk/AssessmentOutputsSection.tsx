"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AssessmentOutput } from "./types";

function formatAssessedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Probability may be stored as 0–1 or 0–100; return 0–100 for display */
function toPercent(n: number): number {
  if (n > 1) return Math.min(100, Math.max(0, n));
  return Math.min(100, Math.max(0, n * 100));
}

/** Severity → left border and severity label color (red / orange / yellow / neutral) */
function severityColor(severity: string | undefined): { border: string; text: string } {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical") return { border: "var(--danger)", text: "var(--danger)" };
  if (s === "severe") return { border: "var(--warning)", text: "var(--warning)" };
  if (s === "moderate") return { border: "var(--caution)", text: "var(--caution)" };
  return { border: "var(--muted)", text: "var(--muted)" };
}

type Props = {
  outputs: AssessmentOutput[];
  onSendToMitigation: (output: AssessmentOutput) => void;
  onRemoveOutput: (id: string) => void;
};

export function AssessmentOutputsSection({
  outputs,
  onSendToMitigation,
  onRemoveOutput,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (outputs.length === 0) return null;

  return (
    <section className="card stack">
      <h3>Assessment outputs</h3>
      <div className="stack-sm">
        {outputs.map((out) => {
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
                  <span className="font-semibold text-sm">{out.issueTitle ?? out.triggerType}</span>
                  {out.assessedAt && (
                    <span className="text-xs muted" title={out.assessedAt}>
                      Assessed {formatAssessedAt(out.assessedAt)}
                    </span>
                  )}
                </div>
                <div className="row" style={{ gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => onSendToMitigation(out)}
                  >
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      send
                    </span>
                    Send to mitigation
                  </button>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => onRemoveOutput(out.id)}
                    aria-label="Remove output"
                  >
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      delete
                    </span>
                    Remove
                  </button>
                </div>
              </div>

              {/* Risk & impact metrics (same structure as mitigation plan card) */}
              <div className="row start" style={{ gap: "1rem", marginTop: "0.5rem" }}>
                {impact?.severity && (
                  <div>
                    <p className="text-xs uppercase muted" style={{ margin: 0 }}>Severity</p>
                    <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0", textTransform: "uppercase", color: sevColor.text }}>{String(impact.severity)}</p>
                  </div>
                )}
                {(prob?.pointEstimate != null || prob?.bandLow != null) && (
                  <div>
                    <p className="text-xs uppercase muted" style={{ margin: 0 }}>Probability</p>
                    <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                      {prob.pointEstimate != null
                        ? `${toPercent(prob.pointEstimate).toFixed(0)}%`
                        : prob.bandLow != null && prob.bandHigh != null
                          ? `${toPercent(prob.bandLow).toFixed(0)}–${toPercent(prob.bandHigh).toFixed(0)}%`
                          : "—"}
                    </p>
                  </div>
                )}
                {prob?.confidence && (
                  <div>
                    <p className="text-xs uppercase muted" style={{ margin: 0 }}>Confidence</p>
                    <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>{String(prob.confidence)}</p>
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
                      {tw.startDate && `${String(tw.startDate)}`}
                      {tw.expectedDurationDays != null && ` · ${tw.expectedDurationDays} days`}
                    </p>
                  </div>
                )}
                {impact && (impact.severity || impact.timelineWeeks != null) && (
                  <div>
                    <p className="text-xs uppercase muted" style={{ margin: 0 }}>Impact</p>
                    <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0", color: impact.severity ? sevColor.text : undefined }}>
                      {impact.severity && String(impact.severity)}
                      {impact.timelineWeeks != null && ` · ${impact.timelineWeeks} wk`}
                    </p>
                  </div>
                )}
              </div>

              {/* Key drivers: visible on the card */}
              {Array.isArray(prob?.topDrivers) && prob.topDrivers.length > 0 && (
                <div className="mt-xs">
                  <p className="text-xs uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Key drivers</p>
                  <ul className="text-sm list-disc" style={{ margin: 0 }}>
                    {prob.topDrivers.map((d, i) => (
                      <li key={i} style={{ marginBottom: "0.2rem" }}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key stakeholders */}
              {Array.isArray(a?.keyStakeholders) && a.keyStakeholders.length > 0 && (
                <div className="mt-xs">
                  <p className="text-xs uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Key stakeholders</p>
                  <ul className="text-sm list-disc" style={{ margin: 0 }}>
                    {a.keyStakeholders.map((s, i) => (
                      <li key={i} style={{ marginBottom: "0.2rem" }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Potential losses */}
              {Array.isArray(a?.potentialLosses) && a.potentialLosses.length > 0 && (
                <div className="mt-xs">
                  <p className="text-xs uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Potential losses</p>
                  <ul className="text-sm list-disc" style={{ margin: 0 }}>
                    {a.potentialLosses.map((l, i) => (
                      <li key={i} style={{ marginBottom: "0.2rem" }}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Expandable: how the agent came up with these numbers */}
              <div className="mt-sm">
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => setExpandedId(isExpanded ? null : out.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="material-symbols-rounded btn__icon" aria-hidden>
                    {isExpanded ? "expand_less" : "expand_more"}
                  </span>
                  {isExpanded ? "Hide details" : "Show details"}
                </button>
                {isExpanded && (
                  <div className="card-flat stack-sm mt-xs pad-sm">
                    {(a as any).reasoning && typeof (a as any).reasoning === "object" && (
                      <div className="stack-sm mb-sm">
                        <p className="text-xs font-semibold uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Exact reasoning (how the agent came up with these numbers)</p>
                        {((a as any).reasoning as { probability?: string; impact?: string; financialImpact?: string }).probability?.trim() && (
                          <div>
                            <p className="text-xs uppercase muted" style={{ margin: "0 0 0.2rem 0" }}>Probability & confidence</p>
                            <div className="assessment-reasoning text-sm">
                              <ReactMarkdown>{((a as any).reasoning as { probability?: string }).probability}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {((a as any).reasoning as { impact?: string }).impact?.trim() && (
                          <div>
                            <p className="text-xs uppercase muted" style={{ margin: "0 0 0.2rem 0" }}>Impact & severity</p>
                            <div className="assessment-reasoning text-sm">
                              <ReactMarkdown>{((a as any).reasoning as { impact?: string }).impact}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {((a as any).reasoning as { financialImpact?: string }).financialImpact?.trim() && (
                          <div>
                            <p className="text-xs uppercase muted" style={{ margin: "0 0 0.2rem 0" }}>Financial impact</p>
                            <div className="assessment-reasoning text-sm">
                              <ReactMarkdown>{((a as any).reasoning as { financialImpact?: string }).financialImpact}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {Array.isArray(impact?.affectedAreas) && impact.affectedAreas.length > 0 && (
                      <div>
                        <p className="text-xs uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Affected areas</p>
                        <ul className="text-sm list-disc" style={{ margin: 0 }}>
                          {impact.affectedAreas.map((area, i) => (
                            <li key={i} style={{ marginBottom: "0.2rem" }}>{area}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {prob?.bandLow != null && prob?.bandHigh != null && prob.pointEstimate == null && (
                      <p className="text-xs muted">
                        Probability band: {toPercent(prob.bandLow).toFixed(0)}%–{toPercent(prob.bandHigh).toFixed(0)}%.
                      </p>
                    )}
                    {fin?.hardCostIncreaseUsd != null && fin.hardCostIncreaseUsd > 0 && (
                      <p className="text-xs muted">
                        Hard cost increase (agent estimate): ${Number(fin.hardCostIncreaseUsd).toLocaleString()}.
                      </p>
                    )}
                    {(!prob?.topDrivers?.length && !impact?.affectedAreas?.length && (prob?.bandLow == null || prob?.bandHigh == null) && (fin?.hardCostIncreaseUsd == null || fin.hardCostIncreaseUsd === 0)) && (
                      <p className="text-xs muted">No additional driver or area detail was returned for this assessment.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
