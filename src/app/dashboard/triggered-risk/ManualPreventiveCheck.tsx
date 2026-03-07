"use client";

import { useState } from "react";
import type { SelectedSignal } from "./types";

const PLACEHOLDER = "e.g. Shipment delayed 3 months, port closure…";

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
    <section className="card stack collapsible-card">
      <div
        className="collapsible-card__header"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="collapsible-card__title">
          <span
            className="collapsible-card__chevron"
            aria-expanded={expanded}
            aria-hidden
          >
            &gt;
          </span>
          <h3 style={{ margin: 0 }}>Manual case</h3>
        </div>
        <div className="collapsible-card__header-actions" onClick={(ev) => ev.stopPropagation()}>
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
          <p className="muted text-sm collapsible-card__subhead">Type a scenario to add to the risk assessment.</p>
          <div className="stack-sm collapsible-card__body">
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
