"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PostAnalysisClient({ plan }: { plan: any }) {
  const [outcomeText, setOutcomeText] = useState("");
  const [isReflecting, setIsReflecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleReflect = async () => {
    if (!outcomeText.trim()) return;
    setIsReflecting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mitigationPlanId: plan.id, actualOutcomeText: outcomeText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setOutcomeText("");
        router.refresh();
      } else {
        setError(data.error || "Failed to run reflection");
      }
    } catch {
      setError("Failed to run reflection");
    } finally {
      setIsReflecting(false);
    }
  };

  const scenario = plan.riskCase?.scenarios?.find((s: any) => s.id === plan.scenarioId) || plan.riskCase?.scenarios?.[0];

  return (
    <div className="card stack">
      <div className="row between">
        <h4 style={{ margin: 0 }}>Incident: {plan.riskCase?.triggerType}</h4>
        <span className="badge">Executed</span>
      </div>

      <div className="muted text-sm">
        <strong>Scenario:</strong> {scenario?.name || "Unknown"}<br />
        <strong>Expected Cost Delta:</strong> {scenario?.costDelta != null ? (scenario.costDelta > 10 ? `${Math.min(500, Math.round(scenario.costDelta))}%` : `${(scenario.costDelta * 100 - 100) >= 0 ? "+" : ""}${(scenario.costDelta * 100 - 100).toFixed(1)}%`) : "N/A"}
      </div>

      <label className="field">
        Real-world outcome
        <textarea
          placeholder="E.g., The alternative carrier charged $500 extra but arrived on time. No SLA breached."
          value={outcomeText}
          onChange={(e) => setOutcomeText(e.target.value)}
          rows={3}
        />
      </label>

      {error && <p className="text-sm text-danger" style={{ margin: 0 }}>{error}</p>}

      <div className="row between">
        <span className="muted text-xs">This will add an entry to Memory.</span>
        <button onClick={handleReflect} disabled={isReflecting || !outcomeText.trim()} className="btn primary btn-sm">
          {isReflecting ? "Generating learnings…" : "Run AI Reflection"}
        </button>
      </div>
    </div>
  );
}
