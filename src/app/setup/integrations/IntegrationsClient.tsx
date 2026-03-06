"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SuggestedIntegrationsBox } from "@/components/SuggestedIntegrationsBox";
import { ZapierMcpEmbed } from "@/components/ZapierMcpEmbed";
import { getSuggestedZoneForTool, getSuggestedZoneLabel } from "@/lib/integration-tool-hint";

type Props = {
  initialInputContextTools: string[];
  initialExecutionTools: string[];
  userEmail?: string;
};

export default function IntegrationsClient({
  initialInputContextTools,
  initialExecutionTools,
  userEmail,
}: Props) {
  const [mcpTools, setMcpTools] = useState<{ name: string; description?: string }[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [inputContext, setInputContext] = useState<Set<string>>(new Set(initialInputContextTools));
  const [execution, setExecution] = useState<Set<string>>(new Set(initialExecutionTools));
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setIsLocalhost(h === "localhost" || h === "127.0.0.1");
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
    <div className="stack-lg">
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
                Use a public URL (e.g. <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>ngrok</a>) and add it at{" "}
                <a href="https://mcp.zapier.com/manage/embed/config" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-text)" }}>mcp.zapier.com → Embed config</a>.
              </p>
            </div>
          ) : (
            <>
              <p className="muted text-sm">
                Sign in or connect your Zapier account in the box below. That connection is tied to <strong>your company</strong> in this app. Once connected, your available tools will appear in the two zones below.
              </p>
              <p className="muted text-sm">
                <strong>Input context</strong> tools are used by the agent to automatically gather data (e.g. read emails, pull CRM data) without interrupting you. <strong>Execution</strong> tools let the agent take action through mitigation plans (e.g. draft and send an email to a supplier). You can assign the same tool to both zones if it supports both reading and acting.
              </p>
            </>
          )}
          <ZapierMcpEmbed embedId={embedId} height="460px" className="zapier-embed-iframe" signUpEmail={userEmail} onMcpServerUrl={handleMcpServerUrl} onToolsChanged={fetchMcpTools} />
          {!isLocalhost && (
            <div className="card-flat stack-xs" style={{ marginTop: "0.75rem", padding: "0.6rem 0.75rem" }}>
              <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>Can&apos;t click Continue?</p>
              <p className="muted text-xs" style={{ margin: 0 }}>
                Zapier&apos;s chat can cover the button. Try: scroll down inside the box so the Continue button moves up, then click it; or press Tab until Continue is focused and press Enter.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="integrations-zones">
        <h3 className="integrations-zones__title">Assign tools to roles</h3>
        <p className="muted text-sm integrations-zones__subtitle">
          Choose which tools the agent uses for gathering context vs. taking action. Selections in each zone are independent.
        </p>

        {toolsLoading ? (
          <p className="muted text-sm">Loading tools…</p>
        ) : mcpTools.length > 0 ? (
          <div className="integrations-zones__grid">
            <div className="card integrations-zone">
              <div className="integrations-zone__header">
                <h4>Input context retrieving</h4>
              </div>
              <p className="muted text-sm integrations-zone__desc">
                The agent uses these tools to automatically retrieve context (e.g. inbox, CRM, ERP). No user interruption.
              </p>
              <div className="integrations-zone__list">
                {mcpTools.slice(0, 50).map((tool) => {
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
              </div>
            </div>

            <div className="card integrations-zone">
              <div className="integrations-zone__header">
                <h4>Execution</h4>
              </div>
              <p className="muted text-sm integrations-zone__desc">
                The agent can use these tools to take action via mitigation plans (e.g. draft and send email to supplier, update a ticket). Archive, send, draft, reply belong here—not in input.
              </p>
              <div className="integrations-zone__list">
                {mcpTools.slice(0, 50).map((tool) => {
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
              </div>
            </div>
          </div>
        ) : (
          <p className="muted text-sm">
            {isLocalhost
              ? "Use a public URL and connect Zapier above to see tools."
              : "No tools yet. Sign in or connect your Zapier account in the embed above; your app tools will then appear in the two zones."}
          </p>
        )}

        <form action="/api/setup/integrations" method="post" className="stack integrations-zones__form" onSubmit={() => setIsSubmitting(true)}>
          {Array.from(inputContext).map((c) => (
            <input key={`in-${c}`} type="hidden" name="inputContextTools" value={c} />
          ))}
          {Array.from(execution).map((c) => (
            <input key={`ex-${c}`} type="hidden" name="executionTools" value={c} />
          ))}
          <div className="row" style={{ marginTop: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Confirm & next"}
            </button>
            <button type="submit" name="redirectTo" value="dashboard" className="btn secondary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save and go to dashboard"}
            </button>
            <Link className="btn secondary" href="/setup/high-level">Skip for now</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
