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

type SectionAnalysis = {
  reasoning: string;
  summary: string;
  warning: string;
};

export default function HighLevelSetupPage() {
  const [sections, setSections] = useState<Record<number, SectionAnalysis>>({});

  // preload existing sections from server
  useEffect(() => {
    fetch("/api/setup/high-level")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          const newSections: Record<number, SectionAnalysis> = {};
          Object.entries(data).forEach(([key, value]) => {
            const idx = profileParts.findIndex((p) =>
              key.toLowerCase().includes(p.replace(/\s+/g, "").toLowerCase())
            );
            if (idx !== -1 && value) {
              newSections[idx] = { reasoning: "", summary: String(value), warning: "" };
            }
          });
          if (Object.keys(newSections).length) {
            setSections((prev) => ({ ...prev, ...newSections }));
          }
        }
      })
      .catch((e) => console.error("failed to fetch high-level profile", e));
  }, []);
  const [isStarted, setIsStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState("");

  const startAnalysis = async () => {
    setIsStarted(true);
    setError("");

    for (let i = 0; i < profileParts.length; i++) {
      setCurrentStep(i);
      try {
        const res = await fetch("/api/setup/high-level/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIndex: i }),
        });

        if (!res.ok) throw new Error("Failed generation at step " + i);
        const data = (await res.json()) as SectionAnalysis;

        setSections((prev) => ({
          ...prev,
          [i]: data,
        }));
      } catch (err: any) {
        console.error(err);
        setError("AI Setup Agent encountered an error. You may edit manually or retry.");
        break; // Stop auto-generation on error
      }
    }

    setIsFinished(true);
  };

  const handleManualEdit = (index: number, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSections((prev) => ({
      ...prev,
      [index]: {
        ...prev[index] || { warning: "", reasoning: "" },
        summary: val,
      },
    }));
  };

  return (
    <main className="container stack">
      <AppHeader title="Setup: High-Level Profile" subtitle="Step 3 of 4" />

      <section className="card stack">
        <p className="muted">
          AI Setup Agent determines your baseline risk and operational tolerances
          based on your base profile and integrations.
        </p>

        {!isStarted && (
          <div className="pad bg-muted radius center" style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ marginBottom: "1rem" }}>
              Ready to construct your high-level profile graph? The agent will
              reason step-by-step through {profileParts.length} dimensions of your supply chain.
            </p>
            <button className="btn primary mx-auto" onClick={startAnalysis}>
              Start AI Reasoning Pipeline
            </button>
          </div>
        )}

        {isStarted && (
          <form className="stack" action="/api/setup/high-level" method="post">
            {profileParts.map((part, index) => {
              const sec = sections[index];
              const isWorking = currentStep === index && !sec && !isFinished;
              const isDone = !!sec;

              return (
                <div key={part} style={{ marginBottom: "1.5rem" }}>
                  <label className="field" style={{ marginBottom: "0.5rem" }}>
                    <strong>{part}</strong>
                    {isWorking && <span className="muted"> (Agent is reasoning...)</span>}
                  </label>

                  {isDone && (
                    <div className="stack" style={{ gap: "0.5rem", marginTop: "0.5rem", padding: "1rem", background: "var(--bg-muted)", borderRadius: "var(--radius)" }}>
                      {sec.warning && (
                        <div style={{ color: "orange", fontSize: "0.85rem", fontWeight: "bold" }}>
                          ⚠️ {sec.warning}
                        </div>
                      )}

                      <div style={{ fontSize: "0.85rem", fontStyle: "italic", borderLeft: "2px solid var(--border)", paddingLeft: "0.5rem" }}>
                        <strong>AI Rationale:</strong> {sec.reasoning}
                      </div>

                      <textarea
                        name="sections"
                        value={sec.summary}
                        onChange={(e) => handleManualEdit(index, e)}
                        rows={3}
                        style={{ marginTop: "0.5rem" }}
                      />
                    </div>
                  )}

                  {!isDone && !isWorking && (
                    <textarea
                      name="sections"
                      disabled
                      placeholder="Waiting for preceding steps..."
                      rows={1}
                    />
                  )}
                </div>
              );
            })}

            {error && <p style={{ color: "red" }}>{error}</p>}

            <div className="row" style={{ marginTop: "2rem" }}>
              <button
                className="btn primary"
                type="submit"
                disabled={!isFinished && !error} // They can save if finished or if it errored out and they filled manually
              >
                Save high-level layer
              </button>
              <Link className="btn" href="/setup/review">
                Skip to Review
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
