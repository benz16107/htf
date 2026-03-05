"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { useState, useEffect } from "react";

export default function BaselayerSetupPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    sector: "",
    companyType: "",
    supplyChainSummary: "",
    manualInput: "",
  });

  // load existing base profile if available
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
      .catch((e) => console.error("failed to fetch existing baselayer", e));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const generateWithAIAgent = async () => {
    if (!formData.companyName && !formData.manualInput) {
      alert("Please provide at least a Company Name or Manual Input to analyze.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/setup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName,
          manualInput: formData.manualInput,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate AI analysis");
      }

      const data = await response.json();

      setFormData((prev) => ({
        ...prev,
        sector: data.sector || prev.sector,
        companyType: `${data.sizeBand ? data.sizeBand + " " : ""}${data.companyType || ""}`.trim() || prev.companyType,
        supplyChainSummary: data.supplyChainSummary || prev.supplyChainSummary,
      }));
    } catch (error) {
      console.error(error);
      alert("Error generating company profile via AI Setup Agent.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="container stack">
      <AppHeader
        title="Setup: Baselayer Company Profile"
        subtitle="Step 1 of 4"
      />

      <section className="card stack">
        <p className="muted">
          Define your base company profile. You can either type a prompt for the AI
          Setup Agent to analyze, or enter information manually below.
        </p>

        <div className="stack" style={{ gap: "1rem" }}>
          <label className="field">
            Company legal name
            <input
              name="companyName"
              required
              placeholder="Acme Logistics"
              value={formData.companyName}
              onChange={handleChange}
            />
          </label>

          <label className="field">
            (Optional) Manual Context for AI Setup Agent
            <textarea
              name="manualInput"
              placeholder="Paste any notes about your supply chain, or links/info for the AI"
              value={formData.manualInput}
              onChange={handleChange}
              rows={3}
            />
          </label>

          <button
            type="button"
            className="btn secondary"
            onClick={generateWithAIAgent}
            disabled={isGenerating}
          >
            {isGenerating ? "AI Agent is Analyzing..." : "Fill with AI Setup Agent"}
          </button>
        </div>

        <hr style={{ margin: "2rem 0", borderColor: "var(--border)" }} />

        <form className="stack" action="/api/setup/baselayer" method="post">
          <input type="hidden" name="companyName" value={formData.companyName} />
          <input type="hidden" name="manualInput" value={formData.manualInput} />

          <label className="field">
            Sector
            <input
              name="sector"
              required
              placeholder="Retail / Manufacturing"
              value={formData.sector}
              onChange={handleChange}
            />
          </label>

          <label className="field">
            Company type and size
            <input
              name="companyType"
              required
              placeholder="Mid-market distributor"
              value={formData.companyType}
              onChange={handleChange}
            />
          </label>

          <label className="field">
            Supply chain summary
            <textarea
              name="supplyChainSummary"
              required
              placeholder="Describe suppliers, lanes, plants, channels, and stakeholders."
              value={formData.supplyChainSummary}
              onChange={handleChange}
              rows={6}
            />
          </label>

          <div className="row">
            <button className="btn primary" type="submit">
              Confirm Base Profile
            </button>
            <Link className="btn" href="/setup/review">
              Review current setup
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
