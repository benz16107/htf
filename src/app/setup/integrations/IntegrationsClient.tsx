"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ZapierMcpEmbed } from "@/components/ZapierMcpEmbed";

type IntegrationsClientProps = {
  initialConnectors: string[];
};

export default function IntegrationsClient({ initialConnectors }: IntegrationsClientProps) {
  const [mcpTools, setMcpTools] = useState<{ name: string; description?: string }[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialConnectors));

  const fetchMcpTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const res = await fetch("/api/zapier/tools");
      const data = await res.json();
      if (res.ok && Array.isArray(data.tools)) {
        if (data.tools.length > 0) {
          setMcpTools(data.tools);
          setSelected((prev) =>
            prev.size === 0 ? new Set(data.tools.slice(0, 5).map((t: { name: string }) => t.name)) : prev
          );
        } else {
          setMcpTools([]);
        }
      }
    } catch {
      // MCP not configured or error - optional
    } finally {
      setToolsLoading(false);
    }
  }, []);

  const handleMcpServerUrl = useCallback(
    async (serverUrl: string) => {
      const res = await fetch("/api/zapier/mcp-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl }),
      });
      if (res.ok) await fetchMcpTools();
    },
    [fetchMcpTools]
  );

  useEffect(() => {
    fetchMcpTools();
  }, [fetchMcpTools]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="stack" style={{ gap: "1.5rem" }}>
      {/* Zapier MCP embed: connect account, then tools appear below */}
      {(process.env.NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID as string) ? (
        <section className="card stack">
          <h3>Connect Zapier (MCP)</h3>
          {typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? (
            <div className="card stack" style={{ padding: "1rem", border: "1px solid var(--border)", backgroundColor: "var(--surface)", borderRadius: "8px" }}>
              <p className="muted" style={{ fontSize: "0.9rem", margin: 0 }}>
                <strong>Zapier’s embed does not work on localhost.</strong> Use a public URL (e.g. <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>ngrok</a>) and add it at{" "}
                <a href="https://mcp.zapier.com/manage/embed/config" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>mcp.zapier.com → Embed config → Allowed domains</a>.
              </p>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "0.5rem 0 0 0" }}>
                Enter <strong>only the hostname</strong> (no <code>https://</code>, no path): e.g. <code>abc123.ngrok-free.app</code> or <code>your-app.vercel.app</code>. If you see &quot;Not a valid domain&quot;, Zapier may not accept that host; try deploying to Vercel/Netlify and use that domain instead.
              </p>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Connect your Zapier account below. Your MCP server URL is saved so the app can list and run your tools. After connecting, refresh or continue to see tools.
            </p>
          )}
          <ZapierMcpEmbed
            embedId={process.env.NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID as string}
            height="500px"
            onMcpServerUrl={handleMcpServerUrl}
            onToolsChanged={fetchMcpTools}
          />
        </section>
      ) : null}

      {/* Zapier MCP tools (after connecting via embed, or when global env set) */}
      <section className="card stack">
        <h3>Zapier tools</h3>
        {toolsLoading ? (
          <p className="muted">Loading…</p>
        ) : mcpTools.length > 0 ? (
          <>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Select which tools to expose in your profile. Mitigation plans can call these by name.
            </p>
            <div className="grid two" style={{ gap: "0.5rem" }}>
              {mcpTools.slice(0, 50).map((tool) => (
                <label key={tool.name} className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" name="connectors" value={tool.name} checked={selected.has(tool.name)} onChange={() => toggle(tool.name)} />
                  <span title={tool.description}>{tool.name}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">
            {typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
              ? "Use ngrok (or deploy) and open this app via a public URL, then connect Zapier above. localhost is not allowed by Zapier’s embed."
              : "Connect Zapier above (set NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID and ZAPIER_MCP_EMBED_SECRET in env) and continue."}
          </p>
        )}

        <form action="/api/setup/integrations" method="post" className="stack" style={{ marginTop: "1rem" }}>
          {Array.from(selected).map((c) => (
            <input key={c} type="hidden" name="connectors" value={c} />
          ))}
          <div className="row" style={{ gap: "0.5rem" }}>
            <button type="submit" className="btn primary">
              Save & continue to high-level profile
            </button>
            <Link className="btn" href="/setup/high-level">
              Skip for now
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
