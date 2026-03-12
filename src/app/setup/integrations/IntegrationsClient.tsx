"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimeStagger } from "@/components/AnimeStagger";
import { DirectEmailConnectionCard } from "@/components/DirectEmailConnectionCard";
import { StatusBanner } from "@/components/StatusBanner";
import { SuggestedIntegrationsBox } from "@/components/SuggestedIntegrationsBox";
import { ZapierMcpEmbed } from "@/components/ZapierMcpEmbed";
import { GEMINI_MODEL_OPTIONS, type GeminiModelId } from "@/lib/gemini-models";
import { getSuggestedZoneForTool, getSuggestedZoneLabel, groupToolsByApp } from "@/lib/integration-tool-hint";

type Props = {
  initialInputContextTools: string[];
  initialExecutionTools: string[];
  initialGeminiModel: GeminiModelId;
  userEmail?: string;
};

export default function IntegrationsClient({
  initialInputContextTools,
  initialExecutionTools,
  initialGeminiModel,
  userEmail,
}: Props) {
  const [mcpTools, setMcpTools] = useState<{ name: string; description?: string }[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [inputContext, setInputContext] = useState<Set<string>>(new Set(initialInputContextTools));
  const [execution, setExecution] = useState<Set<string>>(new Set(initialExecutionTools));
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedStep, setSavedStep] = useState<string | null>(null);
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(initialGeminiModel);

  useEffect(() => {
    const h = window.location.hostname;
    setIsLocalhost(h === "localhost" || h === "127.0.0.1");
    setSavedStep(new URLSearchParams(window.location.search).get("saved"));
  }, []);

  const fetchMcpTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const res = await fetch("/api/zapier/tools");
      const data = await res.json();
      if (res.ok && Array.isArray(data.tools)) {
        setMcpTools(data.tools);
      }
    } catch { /* optional */ } finally { setToolsLoading(false); }
  }, []);

  const handleMcpServerUrl = useCallback(async (serverUrl: string) => {
    const res = await fetch("/api/zapier/mcp-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverUrl }) });
    if (res.ok) await fetchMcpTools();
  }, [fetchMcpTools]);

  useEffect(() => { fetchMcpTools(); }, [fetchMcpTools]);

  const toggleInputContext = (name: string) => {
    setInputContext((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleExecution = (name: string) => {
    setExecution((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const embedId = process.env.NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID as string;

  return (
    <AnimeStagger className="stack-lg" itemSelector="[data-animate-section]" delayStep={85}>
      {savedStep === "baselayer" ? (
        <div data-animate-section>
          <StatusBanner
            variant="success"
            title="Base profile saved"
            message="Next: choose integrations."
          />
        </div>
      ) : null}
      <div data-animate-section>
        <SuggestedIntegrationsBox
          mcpTools={mcpTools}
          onApply={({ inputContextTools, executionTools }) => {
            setInputContext((prev) => new Set([...prev, ...inputContextTools]));
            setExecution((prev) => new Set([...prev, ...executionTools]));
          }}
        />
      </div>

      <div data-animate-section>
        <DirectEmailConnectionCard />
      </div>

      <section className="card stack" data-animate-section>
        <h3>AI model preference</h3>
        <p className="muted text-sm" style={{ margin: 0 }}>
          Choose speed or higher reasoning quality for Gemini-powered analysis.
        </p>
        <div
          className="model-choice-group"
          role="radiogroup"
          aria-label="Gemini model"
          style={{ marginTop: "0.5rem" }}
        >
          {GEMINI_MODEL_OPTIONS.map((option) => {
            const selected = option.id === geminiModel;
            return (
              <label
                key={option.id}
                className={`model-choice ${selected ? "is-selected" : ""}`}
                aria-checked={selected}
              >
                <input
                  type="radio"
                  name="geminiModelUi"
                  checked={selected}
                  onChange={() => setGeminiModel(option.id)}
                />
                <span className="model-choice__content">
                  <span className="model-choice__title">{option.label}</span>
                  <span className="model-choice__id">{option.id}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="muted text-xs" style={{ margin: 0 }}>
          {GEMINI_MODEL_OPTIONS.find((option) => option.id === geminiModel)?.description}
        </p>
      </section>

      {embedId && (
        <section className="card stack" data-animate-section>
          <h3>Connect Zapier (MCP)</h3>
          {isLocalhost ? (
            <div className="card-flat stack-sm text-sm">
              <p className="muted">
                <strong style={{ color: "var(--warning)" }}>Zapier embed doesn&apos;t work on localhost.</strong>{" "}
                Use a public URL (e.g. <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>ngrok</a>) and add it at{" "}
                <a href="https://mcp.zapier.com/manage/embed/config" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>mcp.zapier.com → Embed config</a>.
              </p>
            </div>
          ) : (
            <>
              <p className="muted text-sm">Connect Zapier, then assign tools below.</p>
            </>
          )}
          <ZapierMcpEmbed embedId={embedId} height="460px" className="zapier-embed-iframe" signUpEmail={userEmail} onMcpServerUrl={handleMcpServerUrl} onToolsChanged={fetchMcpTools} />
          {!isLocalhost && (
            <div className="card-flat stack-xs" style={{ marginTop: "0.75rem", padding: "0.6rem 0.75rem" }}>
              <p className="muted text-xs" style={{ margin: 0 }}>
                If Continue is covered, scroll inside the box or press Tab.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="integrations-zones" data-animate-section>
        <h3 className="integrations-zones__title">Assign tools to roles</h3>
        <p className="muted text-sm integrations-zones__subtitle">Input context = read. Execution = act.</p>

        {toolsLoading ? (
          <p className="muted text-sm">Loading tools…</p>
        ) : mcpTools.length > 0 ? (
          <div className="integrations-zones__grid">
            <div className="card integrations-zone">
              <div className="integrations-zone__header">
                <h4>Input context retrieving</h4>
                <div className="row" style={{ gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => setInputContext(new Set(mcpTools.slice(0, 50).map((t) => t.name)))}
                  >
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      select_all
                    </span>
                    Select all
                  </button>
                  <button type="button" className="btn secondary btn-sm" onClick={() => setInputContext(new Set())}>
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      deselect
                    </span>
                    Deselect all
                  </button>
                </div>
              </div>
              <p className="muted text-sm integrations-zone__desc">
                Used to gather context.
              </p>
              <div className="integrations-zone__list">
                {groupToolsByApp(mcpTools.slice(0, 50)).map(({ appKey, appLabel, tools: appTools }) => (
                  <details key={appKey} className="integrations-zone__group">
                    <summary className="integrations-zone__group-summary">
                      <span className="integrations-zone__group-title">{appLabel}</span>
                      <span className="integrations-zone__group-meta">
                        {appTools.reduce((acc, t) => acc + (inputContext.has(t.name) ? 1 : 0), 0)}/{appTools.length}
                      </span>
                      <span className="integrations-zone__group-actions">
                        <button
                          type="button"
                          className="btn secondary btn-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setInputContext((prev) => new Set([...prev, ...appTools.map((t) => t.name)]));
                          }}
                        >
                          <span className="material-symbols-rounded btn__icon" aria-hidden>
                            select_all
                          </span>
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn secondary btn-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const names = new Set(appTools.map((t) => t.name));
                            setInputContext((prev) => {
                              const next = new Set(prev);
                              for (const n of names) next.delete(n);
                              return next;
                            });
                          }}
                        >
                          <span className="material-symbols-rounded btn__icon" aria-hidden>
                            deselect
                          </span>
                          Clear
                        </button>
                      </span>
                    </summary>
                    {appTools.map((tool) => {
                      const suggested = getSuggestedZoneForTool(tool.name);
                      const suggestedLabel = getSuggestedZoneLabel(suggested);
                      const fitsInput = suggested === "input";
                      return (
                        <label key={tool.name} className="integrations-zone__item">
                          <input
                            type="checkbox"
                            checked={inputContext.has(tool.name)}
                            onChange={() => toggleInputContext(tool.name)}
                          />
                          <span className="integrations-zone__item-text">
                            <span title={tool.description}>{tool.name}</span>
                            {suggestedLabel && (
                              <span className={`integrations-zone__hint ${fitsInput ? "integrations-zone__hint--input" : "integrations-zone__hint--execution"}`} title="Suggested based on tool name">
                                {suggestedLabel}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </details>
                ))}
              </div>
            </div>

            <div className="card integrations-zone">
              <div className="integrations-zone__header">
                <h4>Execution</h4>
                <div className="row" style={{ gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => setExecution(new Set(mcpTools.slice(0, 50).map((t) => t.name)))}
                  >
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      select_all
                    </span>
                    Select all
                  </button>
                  <button type="button" className="btn secondary btn-sm" onClick={() => setExecution(new Set())}>
                    <span className="material-symbols-rounded btn__icon" aria-hidden>
                      deselect
                    </span>
                    Deselect all
                  </button>
                </div>
              </div>
              <p className="muted text-sm integrations-zone__desc">
                Used to take action.
              </p>
              <div className="integrations-zone__list">
                {groupToolsByApp(mcpTools.slice(0, 50)).map(({ appKey, appLabel, tools: appTools }) => (
                  <details key={appKey} className="integrations-zone__group">
                    <summary className="integrations-zone__group-summary">
                      <span className="integrations-zone__group-title">{appLabel}</span>
                      <span className="integrations-zone__group-meta">
                        {appTools.reduce((acc, t) => acc + (execution.has(t.name) ? 1 : 0), 0)}/{appTools.length}
                      </span>
                      <span className="integrations-zone__group-actions">
                        <button
                          type="button"
                          className="btn secondary btn-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExecution((prev) => new Set([...prev, ...appTools.map((t) => t.name)]));
                          }}
                        >
                          <span className="material-symbols-rounded btn__icon" aria-hidden>
                            select_all
                          </span>
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn secondary btn-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const names = new Set(appTools.map((t) => t.name));
                            setExecution((prev) => {
                              const next = new Set(prev);
                              for (const n of names) next.delete(n);
                              return next;
                            });
                          }}
                        >
                          <span className="material-symbols-rounded btn__icon" aria-hidden>
                            deselect
                          </span>
                          Clear
                        </button>
                      </span>
                    </summary>
                    {appTools.map((tool) => {
                      const suggested = getSuggestedZoneForTool(tool.name);
                      const suggestedLabel = getSuggestedZoneLabel(suggested);
                      const fitsExecution = suggested === "execution";
                      return (
                        <label key={tool.name} className="integrations-zone__item">
                          <input
                            type="checkbox"
                            checked={execution.has(tool.name)}
                            onChange={() => toggleExecution(tool.name)}
                          />
                          <span className="integrations-zone__item-text">
                            <span title={tool.description}>{tool.name}</span>
                            {suggestedLabel && (
                              <span className={`integrations-zone__hint ${fitsExecution ? "integrations-zone__hint--execution" : "integrations-zone__hint--input"}`} title="Suggested based on tool name">
                                {suggestedLabel}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </details>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="muted text-sm">
            {isLocalhost
              ? "Use a public URL and connect Zapier above to see tools."
              : "No tools yet. Connect Zapier above."}
          </p>
        )}

        <form action="/api/setup/integrations" method="post" className="stack integrations-zones__form" onSubmit={() => setIsSubmitting(true)}>
          <input type="hidden" name="redirectTo" defaultValue="" />
          <input type="hidden" name="geminiModel" value={geminiModel} />
          {Array.from(inputContext).map((c) => (
            <input key={`in-${c}`} type="hidden" name="inputContextTools" value={c} />
          ))}
          {Array.from(execution).map((c) => (
            <input key={`ex-${c}`} type="hidden" name="executionTools" value={c} />
          ))}
          {isSubmitting ? (
            <StatusBanner
              variant="info"
              title="Saving integrations"
              message="Saving changes."
            />
          ) : null}
          <div className="row" style={{ marginTop: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                arrow_forward
              </span>
              {isSubmitting ? "Saving…" : "Confirm & next"}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={isSubmitting}
              onClick={(e) => {
                const form = (e.target as HTMLButtonElement).form;
                const redirectInput = form?.querySelector<HTMLInputElement>('input[name="redirectTo"]');
                if (redirectInput) redirectInput.value = "dashboard";
                form?.requestSubmit();
              }}
            >
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                dashboard
              </span>
              {isSubmitting ? "Saving…" : "Save and go to dashboard"}
            </button>
            <Link className="btn secondary" href="/setup/stakeholders">
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                skip_next
              </span>
              Skip for now
            </Link>
          </div>
        </form>
      </section>
    </AnimeStagger>
  );
}
