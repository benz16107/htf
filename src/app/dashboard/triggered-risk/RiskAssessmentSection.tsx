"use client";

import { useState, useRef, useEffect } from "react";
import type { SelectedSignal, AssessmentOutput } from "./types";
import { PENDING_OUTPUT_KEY } from "./types";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
    setErrorMessage(null);
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
        assessment: data.riskAssessment ?? {},
      };

      if (res.ok && data.riskAssessment) {
        if (mounted.current) {
          onOutput(output);
        } else {
          try {
            localStorage.setItem(PENDING_OUTPUT_KEY, JSON.stringify(output));
          } catch {
            /* ignore */
          }
        }
      } else {
        const msg = data.error || "Risk assessment failed.";
        if (mounted.current) {
          setErrorMessage(msg);
          alert(msg);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error.";
      if (mounted.current) {
        setErrorMessage(msg);
        alert(msg);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <section className="card stack">
      <h3>Risk assessment</h3>
      <p className="muted text-sm">Add signals above, then run assessment. Results appear in Assessment outputs.</p>
      {selectedSignals.length > 0 ? (
        <div className="card-flat stack-sm pad-sm">
          <span className="text-sm font-medium">Signals in this assessment ({selectedSignals.length})</span>
          <ul className="stack-xs list-reset scroll-12">
            {selectedSignals.map((s) => (
              <li key={s.id} className="row between gap-xs">
                <span className="text-sm min-w-0" title={s.summary}>
                  <span className="badge mr-2xs">{s.type}</span>
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
        <p className="muted text-sm">No signals yet. Add from External/Internal signal or Manual case above.</p>
      )}
      {loading && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Assessing… This may take 1–2 minutes. Please stay on this page.
        </p>
      )}
      {errorMessage && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {errorMessage}
        </p>
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
