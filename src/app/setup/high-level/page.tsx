"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useState, useEffect } from "react";

const profileParts = [
  "Existing risk classification and supplier health scoring",
  "Lead-time sensitivity",
  "Inventory buffer policies",
  "Contract structures",
  "Customer SLA profile",
  "ERP signal monitoring",
];

type SectionAnalysis = { reasoning: string; summary: string; warning: string };

export default function HighLevelSetupPage() {
  const [sections, setSections] = useState<Record<number, SectionAnalysis>>({});
  const [isStarted, setIsStarted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/setup/high-level")
      .then((r) => r.json())
      .then((data) => {
        if (!data) return;
        const loaded: Record<number, SectionAnalysis> = {};
        Object.entries(data).forEach(([key, value]) => {
          const idx = profileParts.findIndex((p) => key.toLowerCase().includes(p.replace(/\s+/g, "").toLowerCase()));
          if (idx !== -1 && value) loaded[idx] = { reasoning: "", summary: String(value), warning: "" };
        });
        if (Object.keys(loaded).length) setSections((prev) => ({ ...prev, ...loaded }));
      })
      .catch(() => {});
  }, []);

  const startAnalysis = async () => {
    setIsStarted(true);
    setIsAnalyzing(true);
    setError("");
    try {
      const res = await fetch("/api/setup/high-level/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as { error?: string })?.error || "AI agent encountered an error. You can edit manually or retry.");
        setIsAnalyzing(false);
        return;
      }
      const byIndex = data as Record<string, SectionAnalysis>;
      const next: Record<number, SectionAnalysis> = {};
      profileParts.forEach((_, i) => {
        const key = String(i);
        const s = byIndex[key] ?? byIndex[i];
        if (s) next[i] = { reasoning: s.reasoning ?? "", summary: s.summary ?? "", warning: s.warning ?? "" };
      });
      setSections((prev) => ({ ...prev, ...next }));
    } catch {
      setError("AI agent encountered an error. You can edit manually or retry.");
    } finally {
      setIsAnalyzing(false);
      setIsFinished(true);
    }
  };

  const handleManualEdit = (index: number, value: string) => {
    setSections((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || { warning: "", reasoning: "" }), summary: value },
    }));
  };

  return (
    <main className="container stack-xl">
      <AppHeader title="High-Level Profile" subtitle="Step 3 of 4 — AI determines your risk baselines and tolerances." />

      <section className="card stack-lg">
        {!isStarted && (
          <div className="empty-state" style={{ padding: "2.5rem 1.5rem" }}>
            <h3>Ready to build your profile?</h3>
            <p>The agent will analyze all {profileParts.length} dimensions of your supply chain in one pass.</p>
            <button className="btn primary" style={{ marginTop: "1.5rem" }} onClick={startAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? "Analyzing all sections…" : "Analyze with AI"}
            </button>
          </div>
        )}

        {isStarted && (
          <form className="stack-lg" action="/api/setup/high-level" method="post" onSubmit={() => setIsSubmitting(true)}>
            {isAnalyzing && (
              <p className="muted text-sm" style={{ marginBottom: "0.5rem" }}>
                Analyzing all sections… this may take a moment.
              </p>
            )}
            {profileParts.map((part, index) => {
              const sec = sections[index];
              const isDone = !!sec;
              const hasWarning = !!sec?.warning;
              const hasReasoning = !!sec?.reasoning;
              const summaryBullets =
                sec?.summary
                  ?.split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 3) ?? [];

              return (
                <div key={part} className="card-flat stack-sm">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="stack-sm" style={{ flex: 1 }}>
                      <span className="text-xs uppercase muted">
                        Step {index + 1} of {profileParts.length}
                      </span>
                      <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                        {part}
                      </span>
                    </div>
                    <div className="row" style={{ gap: "0.4rem" }}>
                      {isDone && <span className="badge success">Profiled</span>}
                      {!isDone && isAnalyzing && <span className="badge accent">Analyzing…</span>}
                    </div>
                  </div>

                  {sec ? (
                    <div className="stack-sm">
                      {/* Transparency strip */}
                      <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                        <span className="badge text-xs">
                          Evidence: {hasWarning ? "needs more input" : "sufficient for now"}
                        </span>
                        <span className="badge text-xs">
                          Rationale: {hasReasoning ? "captured" : "limited"}
                        </span>
                      </div>

                      {/* Key points from summary */}
                      {summaryBullets.length > 0 && (
                        <div className="stack-sm">
                          <p className="text-xs uppercase muted">Key points</p>
                          <ul className="text-sm" style={{ paddingLeft: "1.1rem", lineHeight: 1.5 }}>
                            {summaryBullets.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Agent rationale */}
                      {sec.reasoning && (
                        <details className="text-sm" style={{ marginTop: "0.25rem" }}>
                          <summary className="muted text-xs" style={{ cursor: "pointer" }}>
                            Why the agent chose this
                          </summary>
                          <p
                            className="text-sm muted"
                            style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.75rem", marginTop: "0.35rem", fontStyle: "italic" }}
                          >
                            {sec.reasoning}
                          </p>
                        </details>
                      )}

                      {/* Manual edit textarea */}
                      <label className="field" style={{ marginTop: "0.5rem" }}>
                        Edit summary (optional)
                        <textarea
                          name="sections"
                          value={sec.summary}
                          onChange={(e) => handleManualEdit(index, e.target.value)}
                          rows={3}
                        />
                      </label>

                      {sec.warning && (
                        <p className="text-sm" style={{ color: "var(--warning)" }}>
                          Warning: {sec.warning}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted text-sm">
                      {isAnalyzing ? "Analyzing…" : "Run the analysis to fill this section."}
                    </p>
                  )}
                </div>
              );
            })}

            {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <button className="btn primary" type="submit" disabled={(Object.keys(sections).length === 0 && !error) || isSubmitting}>
                {isSubmitting ? "Saving…" : "Confirm & next"}
              </button>
              <button className="btn secondary" type="submit" name="redirectTo" value="dashboard" disabled={(Object.keys(sections).length === 0 && !error) || isSubmitting}>
                {isSubmitting ? "Saving…" : "Save and go to dashboard"}
              </button>
              <Link className="btn secondary" href="/setup/review">Skip to review</Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
