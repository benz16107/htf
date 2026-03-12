"use client";

import { useState } from "react";
import type { SelectedSignal } from "./types";

const PLACEHOLDER = "e.g. Shipment delayed 3 months, port closure…";

type Props = {
  onAddToAssessment?: (item: SelectedSignal) => void;
};

export function ManualSignalSection({ onAddToAssessment }: Props) {
  const [scenario, setScenario] = useState("");
  const [expanded, setExpanded] = useState(false);
  const trimmedScenario = scenario.trim();
  const canAdd = Boolean(trimmedScenario && onAddToAssessment);

  const handleAddToAssessment = () => {
    const text = trimmedScenario;
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
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            setExpanded((e) => !e);
          }
        }}
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
          <h3 style={{ margin: 0 }}>Manual signal</h3>
          {trimmedScenario && <span className="badge">Draft</span>}
        </div>
        <div className="collapsible-card__header-actions" onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => setScenario("")}
            disabled={!trimmedScenario}
          >
            <span className="material-symbols-rounded btn__icon" aria-hidden>
              mop
            </span>
            Clear
          </button>
          {onAddToAssessment && (
            <button type="button" className="btn primary btn-sm" onClick={handleAddToAssessment} disabled={!canAdd}>
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                playlist_add
              </span>
              Add to risk assessment
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <>
          <p className="muted text-sm collapsible-card__subhead">Log a manual signal that should be included in this assessment.</p>
          <div className="card-flat stack-sm collapsible-card__body">
            <p className="text-sm font-medium" style={{ margin: 0 }}>
              Signal details
            </p>
            <textarea
              className="input"
              placeholder={PLACEHOLDER}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={4}
              style={{ resize: "vertical", minHeight: "4rem" }}
            />
            <div className="row between gap-xs">
              <span className="text-xs muted">
                {trimmedScenario ? `${trimmedScenario.length} character${trimmedScenario.length === 1 ? "" : "s"}` : "No draft yet"}
              </span>
              <span className="text-xs muted">Use the header button to add.</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
