"use client";

import { useCallback, useEffect, useState } from "react";

export type SuggestionsResult = {
  inputContextSuggestions: string[];
  executionSuggestions: string[];
};

/** Tool names to add to each zone when applying suggestions (matched from mcpTools). */
export type ApplySuggestionsPayload = {
  inputContextTools: string[];
  executionTools: string[];
};

type Tool = { name: string; description?: string };

type Props = {
  /** Available MCP tools (from Zapier). Used to match suggestions and apply. */
  mcpTools: Tool[];
  onApply: (payload: ApplySuggestionsPayload) => void;
  className?: string;
};

function matchToolsToAppNames(tools: Tool[], appNames: string[]): string[] {
  const lowerAppNames = appNames.map((a) => a.toLowerCase());
  return tools
    .filter((tool) =>
      lowerAppNames.some((app) => tool.name.toLowerCase().includes(app))
    )
    .map((t) => t.name);
}

export function SuggestedIntegrationsBox({ mcpTools, onApply, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsResult | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/suggestions");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load suggestions");
        setSuggestions(null);
        return;
      }
      setSuggestions({
        inputContextSuggestions: data.inputContextSuggestions ?? [],
        executionSuggestions: data.executionSuggestions ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setSuggestions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const hasSuggestions =
    suggestions &&
    (suggestions.inputContextSuggestions.length > 0 ||
      suggestions.executionSuggestions.length > 0);

  const handleApply = useCallback(() => {
    if (!suggestions) return;
    const inputContextTools = matchToolsToAppNames(
      mcpTools,
      suggestions.inputContextSuggestions
    );
    const executionTools = matchToolsToAppNames(
      mcpTools,
      suggestions.executionSuggestions
    );
    onApply({ inputContextTools, executionTools });
  }, [suggestions, mcpTools, onApply]);

  return (
    <section className={`card suggested-integrations-box ${className ?? ""}`}>
      <div className="suggested-integrations-box__header">
        <span className="suggested-integrations-box__icon" aria-hidden>
          ✨
        </span>
        <h4>Recommended to enable in Zapier</h4>
      </div>
      <p className="muted text-sm suggested-integrations-box__desc">
        Based on your company profile, we recommend enabling these integrations in the Zapier
        embed below. We can&apos;t connect them for you—each app (Gmail, Slack, etc.) requires you to sign in
        in the embed. Once you&apos;ve connected apps below, use the button to pre-fill the zone checkboxes.
      </p>

      {loading ? (
        <p className="muted text-sm">Loading suggestions…</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : hasSuggestions ? (
        <div className="suggested-integrations-box__results">
          {suggestions.inputContextSuggestions.length > 0 && (
            <div className="suggested-integrations-box__list">
              <span className="text-xs font-semibold muted uppercase">
                For input context (read data)
              </span>
              <ul>
                {suggestions.inputContextSuggestions.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          {suggestions.executionSuggestions.length > 0 && (
            <div className="suggested-integrations-box__list">
              <span className="text-xs font-semibold muted uppercase">
                For execution (take action)
              </span>
              <ul>
                {suggestions.executionSuggestions.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          {mcpTools.length > 0 && (
            <div className="suggested-integrations-box__actions">
              <p className="muted text-xs" style={{ marginBottom: "0.35rem" }}>
                Already connected apps in the embed? Pre-fill the input context and execution zones below with tools that match these recommendations.
              </p>
              <div className="row" style={{ gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn primary btn-sm"
                  onClick={handleApply}
                >
                  Pre-fill zones from suggestions
                </button>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={fetchSuggestions}
                  disabled={loading}
                >
                  Refresh suggestions
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="muted text-sm">
          No specific recommendations for this profile. You can enable any Zapier apps that fit
          your workflow.
        </p>
      )}
    </section>
  );
}
