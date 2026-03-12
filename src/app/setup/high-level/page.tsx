"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { StatusBanner } from "@/components/StatusBanner";
import { useState, useEffect } from "react";

const profileParts = [
  "Existing risk classification and supplier health scoring",
  "Lead-time sensitivity",
  "Inventory buffer policies",
  "Contract structures",
  "Customer SLA profile",
  "ERP signal monitoring",
];

const sectionKeys = [
  "riskClassification",
  "leadTimeSensitivity",
  "inventoryBufferPolicies",
  "contractStructures",
  "customerSLAProfile",
  "erpSignalMonitoring",
];

type SectionAnalysis = { reasoning: string; summary: string; warning: string };

export default function HighLevelSetupPage() {
  const [sections, setSections] = useState<Record<number, SectionAnalysis>>({});
  const [isStarted, setIsStarted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [savedStep, setSavedStep] = useState<string | null>(null);

  useEffect(() => {
    setSavedStep(new URLSearchParams(window.location.search).get("saved"));
    fetch("/api/setup/high-level")
      .then((r) => r.json())
      .then((data) => {
        if (!data || typeof data !== "object") return;
        const loaded: Record<number, SectionAnalysis> = {};
        sectionKeys.forEach((key, idx) => {
          const value = (data as Record<string, unknown>)[key];
          if (value != null && String(value).trim() !== "")
            loaded[idx] = { reasoning: "", summary: String(value).trim(), warning: "" };
        });
        if (Object.keys(loaded).length > 0) {
          setSections((prev) => ({ ...prev, ...loaded }));
          setIsStarted(true);
        }
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
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const formData = new FormData();
      for (let i = 0; i < profileParts.length; i++) {
        formData.append("sections", sections[i]?.summary ?? "");
      }
      const res = await fetch("/api/setup/high-level", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else setSaveStatus("error");
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <AnimeStagger className="container stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="High-level profile" subtitle="Step 4 of 5" />
      </div>
      {savedStep === "stakeholders" ? (
        <div data-animate-section>
          <StatusBanner
            variant="success"
            title="Supply chain links saved"
            message="Stakeholder mapping is ready. Finish the high-level profile to complete setup."
          />
        </div>
      ) : null}

      <section className="card stack-lg" data-animate-section>
        {!isStarted && (
          <div className="empty-state pad-lg">
            <h3>Ready to build your profile?</h3>
            <p>The agent will analyze all {profileParts.length} dimensions of your supply chain in one pass.</p>
            <button className="btn primary mt-lg" onClick={startAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? "Analyzing all sections…" : "Analyze with AI"}
            </button>
          </div>
        )}

        {isStarted && (
          <form className="stack-lg" action="/api/setup/high-level" method="post" onSubmit={() => setIsSubmitting(true)}>
            <input type="hidden" name="redirectTo" defaultValue="" />
            <div className="row gap-xs mb-sm">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={startAnalysis}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? "Analyzing…" : "Reanalyze with AI"}
              </button>
              <span className="muted text-xs">Run the agent again to regenerate all sections (save first to keep edits).</span>
            </div>
            {isAnalyzing && (
              <p className="muted text-sm mb-xs">Analyzing all sections… this may take a moment.</p>
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
                  <div className="row between">
                    <div className="stack-sm" style={{ flex: 1 }}>
                      <span className="text-xs uppercase muted">
                        Step {index + 1} of {profileParts.length}
                      </span>
                      <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                        {part}
                      </span>
                    </div>
                    <div className="row gap-2xs">
                      {isDone && <span className="badge success">Profiled</span>}
                      {!isDone && isAnalyzing && <span className="badge accent">Analyzing…</span>}
                    </div>
                  </div>

                  {sec ? (
                    <div className="stack-sm">
                      {/* Transparency strip */}
                      <div className="row gap-2xs">
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
                          <ul className="text-sm list-disc">
                            {summaryBullets.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Agent rationale */}
                      {sec.reasoning && (
                        <details className="text-sm inline-details mt-2xs">
                          <summary className="muted text-xs">
                            Why the agent chose this
                          </summary>
                          <p className="text-sm callout mt-2xs">{sec.reasoning}</p>
                        </details>
                      )}

                      {/* Manual edit textarea */}
                      <label className="field mt-xs">
                        Edit summary (optional)
                        <textarea
                          name="sections"
                          value={sec.summary}
                          onChange={(e) => handleManualEdit(index, e.target.value)}
                          rows={3}
                        />
                      </label>

                      {sec.warning && (
                        <p className="text-sm text-warning">
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

            {error && <p className="text-sm text-danger">{error}</p>}
            {saveStatus === "saving" ? (
              <StatusBanner
                variant="info"
                title="Saving high-level profile"
                message="Your edits are being stored so you can continue without losing progress."
              />
            ) : null}
            {saveStatus === "saved" ? (
              <StatusBanner
                variant="success"
                title="High-level profile saved"
                message="Your latest edits are saved."
              />
            ) : null}
            {saveStatus === "error" ? (
              <StatusBanner
                variant="error"
                title="Could not save profile"
                message="Please try again."
              />
            ) : null}

            <div className="row gap-xs">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={handleSave}
                disabled={Object.keys(sections).length === 0 || saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving…" : "Save"}
              </button>
              <button className="btn primary" type="submit" disabled={(Object.keys(sections).length === 0 && !error) || isSubmitting}>
                {isSubmitting ? "Saving…" : "Confirm & next"}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={(Object.keys(sections).length === 0 && !error) || isSubmitting}
                onClick={(e) => {
                  const form = (e.target as HTMLButtonElement).form;
                  const redirectInput = form?.querySelector<HTMLInputElement>('input[name="redirectTo"]');
                  if (redirectInput) redirectInput.value = "dashboard";
                  form?.requestSubmit();
                }}
              >
                {isSubmitting ? "Saving…" : "Save and go to dashboard"}
              </button>
              <Link className="btn secondary" href="/setup/review">Skip to review</Link>
            </div>
          </form>
        )}
      </section>
    </AnimeStagger>
  );
}
