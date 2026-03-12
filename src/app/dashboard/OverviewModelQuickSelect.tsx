"use client";

import { useState } from "react";
import { GEMINI_MODEL_OPTIONS, type GeminiModelId } from "@/lib/gemini-models";

type Props = {
  initialGeminiModel: GeminiModelId;
};

export function OverviewModelQuickSelect({ initialGeminiModel }: Props) {
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(initialGeminiModel);
  const [saving, setSaving] = useState(false);

  const setModel = async (nextModel: GeminiModelId) => {
    if (saving || nextModel === geminiModel) return;
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/model-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ geminiModel: nextModel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not save model.");
      }
      setGeminiModel(nextModel);
    } catch {
      // Keep the current selection if save fails.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overview-model-quick">
      <div className="overview-model-quick__row" role="group" aria-label="Model preference">
        {GEMINI_MODEL_OPTIONS.map((option) => {
          const selected = option.id === geminiModel;
          const shortLabel = option.id.endsWith("-pro") ? "Pro" : "Flash";
          return (
            <button
              key={option.id}
              type="button"
              className={`btn secondary btn-sm overview-model-quick__btn ${selected ? "is-selected" : ""}`}
              onClick={() => setModel(option.id)}
              disabled={saving}
              title={option.description}
              aria-pressed={selected}
            >
              {shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
