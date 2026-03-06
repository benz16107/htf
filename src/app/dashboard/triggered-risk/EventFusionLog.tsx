"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TriggerRiskButton } from "@/components/TriggerRiskButton";

const AUTO_SCAN_STORAGE_KEY = "risk-auto-scan";
const AUTO_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 min

type EventItem = {
  id: string;
  source: string;
  toolName: string;
  signal: string;
  time: string;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return d.toLocaleDateString();
}

function getStoredAutoScan(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUTO_SCAN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function EventFusionLog() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const mounted = useRef(true);

  const fetchEvents = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/risk/events");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Failed to load events";
        setError(res.status === 401 ? "Please sign in again." : msg);
        setEvents([]);
        return;
      }
      setEvents(
        (data.events || []).map((e: { id: string; source: string; toolName: string; signal: string; time: string }) => ({
          ...e,
          time: formatTime(e.time),
        }))
      );
    } catch {
      setError("Failed to load events. Check the console and ensure the app and database are running.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setAutoScan(getStoredAutoScan());
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const runIngest = useCallback(async () => {
    if (!mounted.current) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/risk/ingest", { method: "POST" });
      const data = await res.json();
      if (!mounted.current) return;
      if (!res.ok) {
        setError(data.error || "Sync failed");
        return;
      }
      await fetchEvents();
    } catch {
      if (mounted.current) setError("Sync failed");
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [fetchEvents]);

  // Auto scan: run ingest on mount when enabled, then on interval
  useEffect(() => {
    if (!autoScan) return;
    runIngest();
    const t = setInterval(() => {
      if (mounted.current && autoScan) runIngest();
    }, AUTO_SCAN_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we want to react to autoScan only for start/stop; runIngest identity is stable enough
  }, [autoScan]);

  const handleToggleAutoScan = () => {
    const next = !autoScan;
    setAutoScan(next);
    try {
      localStorage.setItem(AUTO_SCAN_STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  const handleSync = async () => {
    await runIngest();
  };

  return (
    <section className="card stack" style={{ padding: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", padding: "1.25rem 1.25rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ margin: 0 }}>Event Fusion Log</h3>
        <div className="row" style={{ gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="badge accent">Live</span>
          <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={autoScan}
              onChange={handleToggleAutoScan}
              aria-label="Auto scan for integration"
            />
            <span className={autoScan ? "" : "muted"}>Auto scan for integration</span>
          </label>
          {autoScan ? (
            <span className="muted text-sm">{syncing ? "Scanning…" : "Auto finding emails and other sources"}</span>
          ) : (
            <button
              type="button"
              className="btn primary btn-sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Sync from Zapier"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="card-flat stack-xs" style={{ margin: "0.75rem", padding: "0.5rem 0.75rem", borderColor: "var(--danger)" }}>
          <p className="text-sm" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          {error.includes("Zapier") || error.includes("input-context") || error.includes("Sync failed") ? (
            <p className="muted text-xs" style={{ margin: 0 }}>Connect Zapier and assign input-context tools in Dashboard → Integrations, then try Sync from Zapier again.</p>
          ) : error.includes("Prisma") || error.includes("prisma") || error.includes("restart") ? (
            <p className="muted text-xs" style={{ margin: 0 }}>Run <code className="text-xs">npx prisma generate</code>, then stop and restart the dev server (<code className="text-xs">npm run dev</code>).</p>
          ) : null}
        </div>
      )}
      <div className="stack-sm" style={{ padding: "0.75rem" }}>
        {loading ? (
          <p className="muted text-sm">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="muted text-sm">
            {autoScan
              ? "No events yet. Auto scan will keep checking your connected apps (e.g. email). Ensure tools are in the input context zone in Integrations."
              : "No events yet. Turn on Auto scan to automatically find emails and other sources, or click Sync from Zapier to pull once. Assign tools to the input context zone in Integrations."}
          </p>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="trace-row">
              <div className="trace-meta">
                <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>{ev.source}</span>
                <span className="muted text-xs">{ev.time}</span>
              </div>
              <p className="text-sm" style={{ lineHeight: 1.5 }}>&ldquo;{ev.signal}&rdquo;</p>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span className="badge">From {ev.toolName}</span>
                <TriggerRiskButton
                  label="Assess Risk"
                  className="btn primary btn-sm"
                  triggerType={ev.source}
                  entityMap={{ details: ev.signal, source: ev.toolName }}
                  timeWindow={{ detectionTime: "recent", impactWindow: "current_week" }}
                  assumptions={[]}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
