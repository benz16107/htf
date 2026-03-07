"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useState, useEffect } from "react";

export default function BaselayerSetupPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    sector: "",
    companyType: "",
    supplyChainSummary: "",
    manualInput: "",
  });

  useEffect(() => {
    fetch("/api/setup/baselayer")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setFormData((prev) => ({
            ...prev,
            companyName: data.companyName || prev.companyName,
            sector: data.sector || prev.sector,
            companyType: data.companyType || prev.companyType,
            supplyChainSummary: data.supplyChainSummary || prev.supplyChainSummary,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const generateWithAIAgent = async () => {
    if (!formData.companyName && !formData.manualInput) {
      alert("Provide at least a Company Name or context for the AI to analyze.");
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/setup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: formData.companyName, manualInput: formData.manualInput }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        sector: data.sector || prev.sector,
        companyType: `${data.sizeBand ? data.sizeBand + " " : ""}${data.companyType || ""}`.trim() || prev.companyType,
        supplyChainSummary: data.supplyChainSummary || prev.supplyChainSummary,
      }));
    } catch {
      alert("Error generating company profile via AI Setup Agent.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="container stack-xl">
      <AppHeader title="Base profile" subtitle="Step 1 of 4" />

      <section className="card stack-lg">
        <div className="stack">
          <label className="field">
            Company legal name
            <input name="companyName" required placeholder="Acme Logistics" value={formData.companyName} onChange={handleChange} />
          </label>

          <label className="field">
            Context for AI (optional)
            <textarea name="manualInput" placeholder="Optional context for the AI" value={formData.manualInput} onChange={handleChange} rows={3} />
          </label>

          <button type="button" className="btn secondary" onClick={generateWithAIAgent} disabled={isGenerating}>
            {isGenerating ? "AI is analyzing…" : "Fill with AI Setup Agent"}
          </button>
        </div>

        <hr className="divider" />

        <form className="stack" action="/api/setup/baselayer" method="post" onSubmit={() => setIsSubmitting(true)}>
          <input type="hidden" name="companyName" value={formData.companyName} />
          <input type="hidden" name="manualInput" value={formData.manualInput} />
          <input type="hidden" name="redirectTo" defaultValue="" />

          <label className="field">
            Sector
            <input name="sector" required placeholder="Retail / Manufacturing" value={formData.sector} onChange={handleChange} />
          </label>

          <label className="field">
            Company type and size
            <input name="companyType" required placeholder="Mid-market distributor" value={formData.companyType} onChange={handleChange} />
          </label>

          <label className="field">
            Supply chain summary
            <textarea name="supplyChainSummary" required placeholder="Brief supply chain summary" value={formData.supplyChainSummary} onChange={handleChange} rows={5} />
          </label>

          <div className="row gap-xs">
            <button className="btn primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Setting up…" : "Confirm & next"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={isSubmitting}
              onClick={(e) => {
                const form = (e.target as HTMLButtonElement).form;
                const redirectInput = form?.querySelector<HTMLInputElement>('input[name="redirectTo"]');
                if (redirectInput) redirectInput.value = "dashboard";
                form?.requestSubmit();
              }}
            >
              {isSubmitting ? "Saving…" : "Save and go to dashboard"}
            </button>
            <Link className="btn secondary" href="/setup/review">Review setup</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
