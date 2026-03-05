"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ZapierMcpEmbed } from "@/components/ZapierMcpEmbed";

type Props = {
  initialConnectors: string[];
};

export default function IntegrationsDashboardClient({ initialConnectors }: Props) {
  const [mcpTools, setMcpTools] = useState<{ name: string; description?: string }[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialConnectors));

  const fetchMcpTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const res = await fetch("/api/zapier/tools");
      const data = await res.json();
      if (res.ok && Array.isArray(data.tools)) setMcpTools(data.tools);
    } catch {
      // optional
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
  useEffect(() => {
    setSelected(new Set(initialConnectors));
  }, [initialConnectors]);

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
                Enter <strong>only the hostname</strong> (no <code>https://</code>, no path): e.g. <code>abc123.ngrok-free.app</code> or <code>your-app.vercel.app</code>. If you see &quot;Not a valid domain&quot;, try deploying to Vercel/Netlify and use that domain instead.
              </p>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Connect your Zapier account below. After connecting, your tools will appear in the list.
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

      <section className="card stack">
        <h3>Zapier tools</h3>
        {toolsLoading ? (
          <p className="muted">Loading…</p>
        ) : mcpTools.length > 0 ? (
          <form action="/api/dashboard/integrations" method="post" className="stack">
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Tools from your Zapier MCP server. Select which to expose in your profile.
            </p>
            <div className="grid two" style={{ gap: "0.5rem" }}>
              {mcpTools.slice(0, 50).map((tool) => (
                <label key={tool.name} className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" name="connectors" value={tool.name} checked={selected.has(tool.name)} onChange={() => toggle(tool.name)} />
                  <span title={tool.description}>{tool.name}</span>
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: "1rem", gap: "0.5rem" }}>
              <button type="submit" className="btn primary">Save</button>
              <Link className="btn" href="/dashboard">Back to dashboard</Link>
            </div>
          </form>
        ) : (
          <p className="muted">
            {typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
              ? "Zapier’s embed does not work on localhost. Use ngrok or a deployed URL and add it to mcp.zapier.com allowed domains, then connect above."
              : "Connect Zapier above (set NEXT_PUBLIC_ZAPIER_MCP_EMBED_ID and ZAPIER_MCP_EMBED_SECRET in env)."}
          </p>
        )}
      </section>

      <Link href="/setup/integrations" className="btn">
        Full setup workflow
      </Link>
    </div>
  );
}
