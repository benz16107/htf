"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SuggestedIntegrationsBox } from "@/components/SuggestedIntegrationsBox";
import { ZapierMcpEmbed } from "@/components/ZapierMcpEmbed";
import { getSuggestedZoneForTool, getSuggestedZoneLabel, groupToolsByApp } from "@/lib/integration-tool-hint";

type Props = {
  initialInputContextTools: string[];
  initialExecutionTools: string[];
  userEmail?: string;
};

export default function IntegrationsDashboardClient({
  initialInputContextTools,
  initialExecutionTools,
  userEmail,
}: Props) {
  const [mcpTools, setMcpTools] = useState<{ name: string; description?: string }[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [inputContext, setInputContext] = useState<Set<string>>(new Set(initialInputContextTools));
  const [execution, setExecution] = useState<Set<string>>(new Set(initialExecutionTools));
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setIsLocalhost(h === "localhost" || h === "127.0.0.1");
  }, []);

  const fetchMcpTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const res = await fetch("/api/zapier/tools");
      const data = await res.json();
      if (res.ok && Array.isArray(data.tools)) setMcpTools(data.tools);
    } catch { /* optional */ } finally { setToolsLoading(false); }
  }, []);

  const handleMcpServerUrl = useCallback(async (serverUrl: string) => {
    const res = await fetch("/api/zapier/mcp-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverUrl }) });
    if (res.ok) await fetchMcpTools();
  }, [fetchMcpTools]);

  useEffect(() => { fetchMcpTools(); }, [fetchMcpTools]);
  useEffect(() => { setInputContext(new Set(initialInputContextTools)); }, [initialInputContextTools]);
  useEffect(() => { setExecution(new Set(initialExecutionTools)); }, [initialExecutionTools]);

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
    <div className="stack-lg" style={{ maxWidth: "none" }}>
      <SuggestedIntegrationsBox
        mcpTools={mcpTools}
        onApply={({ inputContextTools, executionTools }) => {
          setInputContext((prev) => new Set([...prev, ...inputContextTools]));
          setExecution((prev) => new Set([...prev, ...executionTools]));
        }}
      />

      {embedId && (
        <section className="card stack">
          <h3>Connect Zapier (MCP)</h3>
          {isLocalhost ? (
            <div className="card-flat stack-sm text-sm">
              <p className="muted">
                <strong style={{ color: "var(--warning)" }}>Zapier embed doesn&apos;t work on localhost.</strong>{" "}
                Use a public URL and add it at{" "}
                <a href="https://mcp.zapier.com/manage/embed/config" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>mcp.zapier.com → Embed config</a>.
              </p>
            </div>
          ) : (
            <p className="muted text-sm">Connect below, then assign tools to input context or execution.</p>
          )}
          <ZapierMcpEmbed embedId={embedId} height="460px" className="zapier-embed-iframe" signUpEmail={userEmail} onMcpServerUrl={handleMcpServerUrl} onToolsChanged={fetchMcpTools} />
          {!isLocalhost && (
            <div className="card-flat stack-xs" style={{ marginTop: "0.75rem", padding: "0.6rem 0.75rem" }}>
              <p className="muted text-xs" style={{ margin: 0 }}>If Continue is covered, scroll inside the box or Tab to focus it.</p>
            </div>
          )}
        </section>
      )}

      <section className="integrations-zones">
        <h3 className="integrations-zones__title">Assign tools to roles</h3>
        <p className="muted text-sm integrations-zones__subtitle">Input context = gather data. Execution = take action.</p>

        {toolsLoading ? (
          <p className="muted text-sm">Loading tools…</p>
        ) : mcpTools.length > 0 ? (
          <form action="/api/dashboard/integrations" method="post" className="stack">
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
                      Select all
                    </button>
                    <button type="button" className="btn secondary btn-sm" onClick={() => setInputContext(new Set())}>
                      Deselect all
                    </button>
                  </div>
                </div>
                <p className="muted text-sm integrations-zone__desc">
                  Used to automatically retrieve context (inbox, CRM, ERP). Find, search, list, get—not archive or send.
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
                      Select all
                    </button>
                    <button type="button" className="btn secondary btn-sm" onClick={() => setExecution(new Set())}>
                      Deselect all
                    </button>
                  </div>
                </div>
                <p className="muted text-sm integrations-zone__desc">
                  Agent can take action via mitigation plans (e.g. send email, update ticket). Archive, send, draft, reply belong here.
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
            {Array.from(inputContext).map((c) => (
              <input key={`in-${c}`} type="hidden" name="inputContextTools" value={c} />
            ))}
            {Array.from(execution).map((c) => (
              <input key={`ex-${c}`} type="hidden" name="executionTools" value={c} />
            ))}
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button type="submit" className="btn primary btn-sm">Save</button>
              <Link className="btn secondary btn-sm" href="/dashboard">Back to dashboard</Link>
            </div>
          </form>
        ) : (
          <p className="muted text-sm">
            {isLocalhost ? "Use a public URL to connect Zapier." : "Connect Zapier above to see tools."}
          </p>
        )}
      </section>

      <Link href="/setup/integrations" className="btn secondary btn-sm">Full setup workflow</Link>
    </div>
  );
}
