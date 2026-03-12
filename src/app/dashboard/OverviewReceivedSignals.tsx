"use client";

import { useCallback, useEffect, useState } from "react";

type InternalSignalItem = {
  id: string;
  source: string;
  toolName: string;
  signal: string;
  time: string;
};

type ExternalSignalItem = {
  id?: string;
  title: string;
  snippet: string;
  source?: string;
  createdAt?: string;
};

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "Unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function OverviewReceivedSignals({
  signalSources,
}: {
  signalSources: "internal_only" | "external_only" | "both";
}) {
  const [internalSignals, setInternalSignals] = useState<InternalSignalItem[]>([]);
  const [externalSignals, setExternalSignals] = useState<ExternalSignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [emailReceivedAfterIso, setEmailReceivedAfterIso] = useState<string>(() => new Date().toISOString());

  const showInternalSignals = signalSources === "internal_only" || signalSources === "both";
  const showExternalSignals = signalSources === "external_only" || signalSources === "both";

  const refreshSignals = useCallback(
    async (runCollectors: boolean) => {
      setError(null);
      if (!runCollectors) setLoading(true);
      if (runCollectors) setSyncing(true);

      try {
        if (showInternalSignals) {
          const collectorStartedAt = new Date().toISOString();
          if (runCollectors) {
            const ingestRes = await fetch("/api/risk/ingest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receivedAfter: emailReceivedAfterIso }),
            });
            if (!ingestRes.ok) {
              const ingestData = await ingestRes.json().catch(() => ({}));
              throw new Error(ingestData.error || "Internal signal sync failed");
            }
            setEmailReceivedAfterIso(collectorStartedAt);
          }
          const eventsRes = await fetch("/api/risk/events");
          const eventsData = await eventsRes.json().catch(() => ({}));
          if (!eventsRes.ok) throw new Error(eventsData.error || "Failed to load internal signals");
          setInternalSignals(Array.isArray(eventsData.events) ? eventsData.events : []);
        } else {
          setInternalSignals([]);
        }

        if (showExternalSignals) {
          if (runCollectors) {
            const pullRes = await fetch("/api/risk/external-signals", { method: "POST" });
            const pullData = await pullRes.json().catch(() => ({}));
            if (!pullRes.ok) throw new Error(pullData.error || "External signal pull failed");
          }
          const savedRes = await fetch("/api/risk/external-signals");
          const savedData = await savedRes.json().catch(() => ({}));
          if (!savedRes.ok) throw new Error(savedData.error || "Failed to load external signals");
          setExternalSignals(Array.isArray(savedData.signals) ? savedData.signals : []);
        } else {
          setExternalSignals([]);
        }

        setLastSyncAt(new Date().toISOString());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Signal sync failed");
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [showInternalSignals, showExternalSignals, emailReceivedAfterIso]
  );

  useEffect(() => {
    void refreshSignals(false);
    const collectorTimer = window.setInterval(() => {
      void refreshSignals(true);
    }, 60_000);
    const passiveTimer = window.setInterval(() => {
      void refreshSignals(false);
    }, 15_000);
    return () => {
      window.clearInterval(collectorTimer);
      window.clearInterval(passiveTimer);
    };
  }, [refreshSignals]);

  return (
    <section className="card stack">
      <div className="row between gap-sm" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <div className="row gap-xs" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Received signals</h3>
          {lastSyncAt ? <span className="text-xs muted">Updated {formatRelativeTime(lastSyncAt)}</span> : null}
        </div>
        <div className="row gap-xs" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn secondary btn-sm" onClick={() => void refreshSignals(true)} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm" style={{ margin: 0, color: "var(--danger)" }}>{error}</p> : null}

      <div
        className="stack-sm"
        style={{
          marginTop: "0.5rem",
          display: "grid",
          gridTemplateColumns: showInternalSignals && showExternalSignals ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        {showExternalSignals ? (
          <div className="card-flat stack-sm" style={{ padding: "0.75rem", minHeight: 180 }}>
            <div className="row between" style={{ alignItems: "center", gap: "0.5rem" }}>
              <h4 className="text-sm uppercase muted" style={{ margin: 0 }}>External signals</h4>
              <span className="badge">{externalSignals.length}</span>
            </div>
            {loading ? (
              <p className="muted text-sm">Loading external signals…</p>
            ) : externalSignals.length === 0 ? (
              <p className="muted text-sm">No external signals received yet.</p>
            ) : (
              <div className="stack-xs">
                {externalSignals.slice(0, 4).map((signal, idx) => (
                  <div key={signal.id ?? `external-${idx}`} className="card-flat stack-2xs" style={{ padding: "0.6rem 0.75rem" }}>
                    <p className="text-sm font-medium" style={{ margin: 0 }}>{signal.title || "External signal"}</p>
                    <p className="text-xs muted" style={{ margin: 0 }}>
                      {(signal.source || "External source")} · {formatRelativeTime(signal.createdAt)}
                    </p>
                    {signal.snippet ? <p className="text-xs muted" style={{ margin: 0 }}>{signal.snippet}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {showInternalSignals ? (
          <div className="card-flat stack-sm" style={{ padding: "0.75rem", minHeight: 180 }}>
            <div className="row between" style={{ alignItems: "center", gap: "0.5rem" }}>
              <h4 className="text-sm uppercase muted" style={{ margin: 0 }}>Internal signals</h4>
              <span className="badge">{internalSignals.length}</span>
            </div>
            {loading ? (
              <p className="muted text-sm">Loading internal signals…</p>
            ) : internalSignals.length === 0 ? (
              <p className="muted text-sm">No internal signals received yet.</p>
            ) : (
              <div className="stack-xs">
                {internalSignals.slice(0, 4).map((signal) => (
                  <div key={signal.id} className="card-flat stack-2xs" style={{ padding: "0.6rem 0.75rem" }}>
                    <p className="text-sm font-medium" style={{ margin: 0 }}>{signal.signal || "Internal signal"}</p>
                    <p className="text-xs muted" style={{ margin: 0 }}>
                      {[signal.source, signal.toolName].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs muted" style={{ margin: 0 }}>{formatRelativeTime(signal.time)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
