"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AnimeStagger } from "@/components/AnimeStagger";
import { StatusBanner } from "@/components/StatusBanner";
import { createEmptySupplyChainLink, type SupplyChainLink } from "@/lib/supply-chain-links";

function createNewRow(): SupplyChainLink {
  return createEmptySupplyChainLink();
}

export default function StakeholdersSetupPage() {
  const [rows, setRows] = useState<SupplyChainLink[]>([createNewRow()]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generationSource, setGenerationSource] = useState<"manual" | "ai">("manual");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedStep, setSavedStep] = useState<string | null>(null);

  useEffect(() => {
    setSavedStep(new URLSearchParams(window.location.search).get("saved"));
    fetch("/api/setup/stakeholders")
      .then((response) => response.json())
      .then((data) => {
        const loadedRows = Array.isArray(data?.links) ? (data.links as SupplyChainLink[]) : [];
        if (loadedRows.length > 0) setRows(loadedRows);
      })
      .catch(() => {});
  }, []);

  const activeRowCount = useMemo(
    () => rows.filter((row) => Object.values(row).some((value) => value.trim().length > 0)).length,
    [rows],
  );

  const updateRow = (index: number, key: keyof SupplyChainLink, value: string) => {
    setRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    );
    setGenerationSource("manual");
  };

  const addRow = () => {
    setRows((prev) => [...prev, createNewRow()]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
    setGenerationSource("manual");
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/setup/stakeholders/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = (await res.json()) as { links?: SupplyChainLink[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      if (Array.isArray(data.links) && data.links.length > 0) {
        setRows(data.links);
        setGenerationSource("ai");
      }
    } catch {
      alert("Could not generate supply chain links. Please refine the prompt and retry.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimeStagger className="container-wide stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      <div data-animate-section>
        <AppHeader title="Supply chain links" subtitle="Step 3 of 5" />
      </div>
      {savedStep === "integrations" ? (
        <div data-animate-section>
          <StatusBanner
            variant="success"
            title="Integrations saved"
            message="Now map your suppliers, logistics partners, and process nodes."
          />
        </div>
      ) : null}

      <section className="card stack-lg" data-animate-section>
        <div className="stack-sm">
          <h3 style={{ margin: 0 }}>Fill with AI (optional)</h3>
          <p className="muted text-sm">
            Add context to generate a first draft of suppliers, delivery partners, warehouses, and process links.
          </p>
          <label className="field">
            Context for AI
            <textarea
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              rows={3}
              placeholder="Example: We source from Vietnam and Mexico, consolidate in LA warehouse, then deliver through regional 3PLs."
            />
          </label>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn secondary" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating…" : "Generate with AI"}
            </button>
            <p className="muted text-xs" style={{ margin: 0 }}>
              {activeRowCount} active links
            </p>
          </div>
        </div>

        <hr className="divider" />

        <form className="stack-lg" action="/api/setup/stakeholders" method="post" onSubmit={() => setIsSubmitting(true)}>
          <input type="hidden" name="redirectTo" defaultValue="" />
          <input type="hidden" name="aiPrompt" value={aiPrompt} />
          <input type="hidden" name="generationSource" value={generationSource} />

          {rows.map((row, index) => (
            <article key={index} className="card-flat stack-sm">
              <div className="row between" style={{ alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <p className="text-sm font-semibold" style={{ margin: 0, color: "var(--foreground)" }}>
                  Link {index + 1}
                </p>
                <button type="button" className="btn secondary btn-xs" onClick={() => removeRow(index)} disabled={rows.length <= 1}>
                  Remove
                </button>
              </div>
              <div className="grid two">
                <label className="field">
                  Company or process name
                  <input
                    value={row.name}
                    onChange={(event) => updateRow(index, "name", event.target.value)}
                    placeholder="Northstar Components"
                  />
                </label>
                <label className="field">
                  Type
                  <input
                    value={row.type}
                    onChange={(event) => updateRow(index, "type", event.target.value)}
                    placeholder="Supplier / Delivery partner / Warehouse / Process"
                  />
                </label>
              </div>
              <label className="field">
                Purpose
                <input
                  value={row.purpose}
                  onChange={(event) => updateRow(index, "purpose", event.target.value)}
                  placeholder="Provides tier-1 electronic components"
                />
              </label>
              <label className="field">
                Connections in chain
                <input
                  value={row.connections}
                  onChange={(event) => updateRow(index, "connections", event.target.value)}
                  placeholder="Feeds plant A and emergency lane to plant B"
                />
              </label>
              <div className="grid two">
                <label className="field">
                  Process stage
                  <input
                    value={row.process}
                    onChange={(event) => updateRow(index, "process", event.target.value)}
                    placeholder="Inbound sourcing"
                  />
                </label>
                <label className="field">
                  Location (optional)
                  <input
                    value={row.location}
                    onChange={(event) => updateRow(index, "location", event.target.value)}
                    placeholder="Monterrey, MX"
                  />
                </label>
              </div>
              <div className="grid two">
                <label className="field">
                  Criticality
                  <input
                    value={row.criticality}
                    onChange={(event) => updateRow(index, "criticality", event.target.value)}
                    placeholder="High / Medium / Low"
                  />
                </label>
                <label className="field">
                  Notes
                  <input
                    value={row.notes}
                    onChange={(event) => updateRow(index, "notes", event.target.value)}
                    placeholder="Single-source risk during Q4"
                  />
                </label>
              </div>

              <input type="hidden" name="linkName" value={row.name} />
              <input type="hidden" name="linkType" value={row.type} />
              <input type="hidden" name="linkPurpose" value={row.purpose} />
              <input type="hidden" name="linkConnections" value={row.connections} />
              <input type="hidden" name="linkProcess" value={row.process} />
              <input type="hidden" name="linkLocation" value={row.location} />
              <input type="hidden" name="linkCriticality" value={row.criticality} />
              <input type="hidden" name="linkNotes" value={row.notes} />
            </article>
          ))}

          {isSubmitting ? (
            <StatusBanner
              variant="info"
              title="Saving supply chain links"
              message="Storing stakeholder connections and preparing the high-level profile step."
            />
          ) : null}

          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn secondary" onClick={addRow} disabled={isSubmitting}>
              Add link
            </button>
            <button className="btn primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Confirm & next"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={isSubmitting}
              onClick={(event) => {
                const form = (event.target as HTMLButtonElement).form;
                const redirectInput = form?.querySelector<HTMLInputElement>('input[name="redirectTo"]');
                if (redirectInput) redirectInput.value = "dashboard";
                form?.requestSubmit();
              }}
            >
              {isSubmitting ? "Saving…" : "Save and go to dashboard"}
            </button>
            <Link className="btn secondary" href="/setup/high-level">
              Skip for now
            </Link>
          </div>
        </form>
      </section>
    </AnimeStagger>
  );
}
