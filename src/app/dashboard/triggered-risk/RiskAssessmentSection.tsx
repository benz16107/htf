"use client";

import { useState } from "react";
import type { SelectedSignal, AssessmentOutput } from "./types";

type Props = {
  selectedSignals: SelectedSignal[];
  onRemoveSignal: (id: string) => void;
  onOutput: (output: AssessmentOutput) => void;
};

export function RiskAssessmentSection({
  selectedSignals,
  onRemoveSignal,
  onOutput,
}: Props) {
  const [loading, setLoading] = useState(false);

  const internalSignals = selectedSignals.filter((s) => s.type === "internal");
  const externalSignals = selectedSignals.filter((s) => s.type === "external");
  const manualSignals = selectedSignals.filter((s) => s.type === "manual");

  const internalList =
    internalSignals.length === 0
      ? "No internal signals in this assessment."
      : internalSignals
          .map((s, i) => {
            const p = s.internalPayload;
            return p ? `[${i + 1}] ${p.source || p.toolName}: ${p.signal}` : `[${i + 1}] ${s.summary}`;
          })
          .join("\n");
  const externalList =
    externalSignals.length === 0
      ? "No external signals in this assessment."
      : externalSignals
          .map((s, i) => {
            const p = s.externalPayload;
            return p ? `[${i + 1}] ${p.title}: ${p.snippet}${p.source ? ` (${p.source})` : ""}` : `[${i + 1}] ${s.summary}`;
          })
          .join("\n");
  const manualList =
    manualSignals.length === 0
      ? "No manual scenarios in this assessment."
      : manualSignals
          .map((s, i) => {
            const p = s.manualPayload;
            return p ? `[${i + 1}] (Manual) ${p.scenario}` : `[${i + 1}] ${s.summary}`;
          })
          .join("\n");

  const handleRunAssessment = async () => {
        if (selectedSignals.length === 0) {
      alert("Add at least one signal (external, internal, or manual case) above, then run assessment.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/agents/signal-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerType: "Risk assessment (selected signals)",
          entityMap: {
            instruction: "Assess risk based on ALL of the following signals selected for this assessment. Consider each and their combined effect on supply chain.",
            internalSignalsCount: String(internalSignals.length),
            externalSignalsCount: String(externalSignals.length),
            manualScenariosCount: String(manualSignals.length),
            internalSignals: internalList,
            externalSignals: externalList,
            manualScenarios: manualList,
          },
          timeWindow: {
            detectionTime: "recent",
            impactWindow: "current_week",
            expectedDurationDays: 7,
          },
          assumptions: [],
          createRiskCase: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.riskAssessment) {
        const output: AssessmentOutput = {
          id: `output-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          triggerType: "Risk assessment (selected signals)",
          assessedAt: new Date().toISOString(),
          issueTitle: data.riskAssessment?.issueTitle ?? undefined,
          entityMap: {
            instruction: "Assess risk based on ALL of the following signals selected for this assessment.",
            internalSignalsCount: String(internalSignals.length),
            externalSignalsCount: String(externalSignals.length),
            manualScenariosCount: String(manualSignals.length),
            internalSignals: internalList,
            externalSignals: externalList,
            manualScenarios: manualList,
          },
          timeWindow: { startDate: new Date().toISOString().split("T")[0], expectedDurationDays: 7 },
          assumptions: [],
          assessment: data.riskAssessment,
        };
        onOutput(output);
      } else {
        alert(data.error || "Risk assessment failed.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card stack">
      <h3>Risk assessment</h3>
      <p className="muted text-sm" style={{ margin: 0 }}>
        Add signals from the sections above, then run assessment. The result appears in Assessment outputs below; from there you can send to mitigation or run another assessment.
      </p>
      {selectedSignals.length > 0 ? (
        <div className="card-flat stack-sm" style={{ padding: "0.75rem" }}>
          <span className="text-sm font-medium">Signals in this assessment ({selectedSignals.length})</span>
          <ul className="stack-xs" style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "12rem", overflowY: "auto" }}>
            {selectedSignals.map((s) => (
              <li key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <span className="text-sm" style={{ minWidth: 0 }} title={s.summary}>
                  <span className="badge" style={{ marginRight: "0.35rem" }}>{s.type}</span>
                  {s.summary.slice(0, 60)}{s.summary.length > 60 ? "…" : ""}
                </span>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => onRemoveSignal(s.id)}
                  aria-label="Remove from assessment"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted text-sm" style={{ margin: 0 }}>No signals added yet. Add external or internal signals above, or type a manual case in Manual preventive check and add it here.</p>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={handleRunAssessment}
        disabled={loading || selectedSignals.length === 0}
      >
        {loading ? "Assessing…" : "Run risk assessment"}
      </button>
    </section>
  );
}
