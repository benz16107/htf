"use client";

import { useState } from "react";
import type { SelectedSignal } from "./types";

const PLACEHOLDER = "e.g. The supply product shipment is delayed for 3 months and the company can't ship out their products.";

type Props = {
  onAddToAssessment?: (item: SelectedSignal) => void;
};

export function ManualPreventiveCheck({ onAddToAssessment }: Props) {
  const [scenario, setScenario] = useState("");
  const [expanded, setExpanded] = useState(true);

  const handleAddToAssessment = () => {
    const text = scenario.trim();
    if (!text || !onAddToAssessment) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    onAddToAssessment({
      id,
      type: "manual",
      summary: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      manualPayload: { scenario: text },
    });
    setScenario("");
  };

  return (
    <section className="card stack" style={{ padding: 0 }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.25rem 0.75rem",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span
            className="muted"
            style={{ fontSize: "0.875rem", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            aria-hidden
          >
            &gt;
          </span>
          <h3 style={{ margin: 0 }}>Manual case</h3>
        </div>
        <div className="row" style={{ gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }} onClick={(ev) => ev.stopPropagation()}>
          {onAddToAssessment && (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={handleAddToAssessment}
              disabled={!scenario.trim()}
            >
              Add to risk assessment
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <>
          <p className="muted text-sm" style={{ margin: 0, padding: "0.5rem 1.25rem 0", borderBottom: "1px solid var(--border)" }}>
            Type a scenario (e.g. shipment delayed 3 months, port closure, supplier bankruptcy). Add it to the risk assessment to run with other signals.
          </p>
          <div className="stack-sm" style={{ padding: "0.75rem 1.25rem 1.25rem" }}>
            <textarea
              className="input"
              placeholder={PLACEHOLDER}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={3}
              style={{ resize: "vertical", minHeight: "4rem" }}
            />
            {onAddToAssessment && (
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={handleAddToAssessment}
                disabled={!scenario.trim()}
              >
                Add to risk assessment
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
