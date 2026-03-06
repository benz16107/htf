"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedSignal } from "./types";

const AUTO_SCAN_STORAGE_KEY = "risk-auto-scan";
const INTEGRATIONS_FILTER_KEY = "risk-internal-integrations";
const INTERNAL_CONFIG_KEY = "risk-internal-config";

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
] as const;

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

function getStoredIntegrationFilter(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(INTEGRATIONS_FILTER_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function setStoredIntegrationFilter(integrations: string[]) {
  try {
    if (integrations.length === 0) localStorage.removeItem(INTEGRATIONS_FILTER_KEY);
    else localStorage.setItem(INTEGRATIONS_FILTER_KEY, JSON.stringify(integrations));
  } catch {}
}

type InternalConfig = { intervalMinutes: number };

function getStoredInternalConfig(): InternalConfig {
  if (typeof window === "undefined") return { intervalMinutes: 5 };
  try {
    const raw = localStorage.getItem(INTERNAL_CONFIG_KEY);
    if (!raw) return { intervalMinutes: 5 };
    const parsed = JSON.parse(raw) as { intervalMinutes?: number };
    const min = parsed?.intervalMinutes;
    if (typeof min === "number" && INTERVAL_OPTIONS.some((o) => o.value === min)) return { intervalMinutes: min };
    return { intervalMinutes: 5 };
  } catch {
    return { intervalMinutes: 5 };
  }
}

function setStoredInternalConfig(config: InternalConfig) {
  try {
    localStorage.setItem(INTERNAL_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

function InternalSignalRow({
  ev,
  onDelete,
  onAddToAssessment,
}: {
  ev: EventItem;
  onDelete: () => void;
  onAddToAssessment?: (item: SelectedSignal) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/risk/events/${ev.id}`, { method: "DELETE" });
      if (res.ok) onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="trace-row">
      <div className="trace-meta">
        <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>{ev.source}</span>
        <span className="muted text-xs">{ev.time}</span>
      </div>
      <p className="text-sm" style={{ lineHeight: 1.5 }}>&ldquo;{ev.signal}&rdquo;</p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <span className="badge">From {ev.toolName}</span>
        <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
          {onAddToAssessment && (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() =>
                onAddToAssessment({
                  id: `internal-${ev.id}`,
                  type: "internal",
                  summary: `${ev.source || ev.toolName}: ${ev.signal.slice(0, 60)}${ev.signal.length > 60 ? "…" : ""}`,
                  internalPayload: { signal: ev.signal, source: ev.source, toolName: ev.toolName },
                })
              }
            >
              Add to risk assessment
            </button>
          )}
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={handleDelete}
            disabled={deleting}
            title="Remove this signal"
            aria-label="Remove signal"
          >
            {deleting ? "…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

type InternalSignalSectionProps = {
  onAddToAssessment?: (item: SelectedSignal) => void;
};

export function InternalSignalSection({ onAddToAssessment }: InternalSignalSectionProps) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [configuredTools, setConfiguredTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[] | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [clearingAll, setClearingAll] = useState(false);
  const [lastSyncTools, setLastSyncTools] = useState<{ name: string; status: string; count: number }[] | null>(null);
  const mounted = useRef(true);

  const fetchToolSelections = useCallback(async () => {
    try {
      const res = await fetch("/api/zapier/tool-selections");
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.inputContextTools)) {
        setConfiguredTools(data.inputContextTools);
      }
    } catch { /* ignore */ }
  }, []);

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
      setError("Failed to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setAutoScan(getStoredAutoScan());
    setIntervalMinutes(getStoredInternalConfig().intervalMinutes);
    const stored = getStoredIntegrationFilter();
    if (stored && stored.length > 0) setSelectedIntegrations(stored);
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    fetchToolSelections();
  }, [fetchToolSelections]);

  const fromEvents = Array.from(new Set(events.map((e) => e.toolName || e.source).filter(Boolean)));
  const integrations = Array.from(new Set([...configuredTools, ...fromEvents]));
  const integrationSet = new Set(integrations);
  const sanitizedSelection =
    selectedIntegrations && selectedIntegrations.length > 0
      ? selectedIntegrations.filter((n) => integrationSet.has(n))
      : null;
  const displaySet = sanitizedSelection && sanitizedSelection.length > 0 ? new Set(sanitizedSelection) : null;

  useEffect(() => {
    if (selectedIntegrations && selectedIntegrations.length > 0 && sanitizedSelection && sanitizedSelection.length < selectedIntegrations.length) {
      setSelectedIntegrations(sanitizedSelection);
      setStoredIntegrationFilter(sanitizedSelection);
    }
  }, [integrations.join(","), selectedIntegrations?.join(",")]);


  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const runIngest = useCallback(async () => {
    if (!mounted.current) return;
    setSyncing(true);
    setError(null);
    setLastSyncTools(null);
    try {
      const res = await fetch("/api/risk/ingest", { method: "POST" });
      const data = await res.json();
      if (!mounted.current) return;
      if (!res.ok) {
        setError(data.error || "Sync failed");
        return;
      }
      if (Array.isArray(data.tools)) setLastSyncTools(data.tools);
      await fetchEvents();
    } catch {
      if (mounted.current) setError("Sync failed");
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [fetchEvents]);

  useEffect(() => {
    if (!autoScan) return;
    runIngest();
    const ms = intervalMinutes * 60 * 1000;
    const t = setInterval(() => {
      if (mounted.current && autoScan) runIngest();
    }, ms);
    return () => clearInterval(t);
  }, [autoScan, intervalMinutes]);

  const handleToggleAutoScan = () => {
    const next = !autoScan;
    setAutoScan(next);
    try {
      localStorage.setItem(AUTO_SCAN_STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  const filteredEvents = displaySet
    ? events.filter((e) => displaySet.has(e.toolName) || displaySet.has(e.source))
    : events;

  const toggleIntegration = (name: string) => {
    if (selectedIntegrations === null) {
      const next = integrations.filter((n) => n !== name);
      setSelectedIntegrations(next.length === 0 ? null : next);
      setStoredIntegrationFilter(next.length === 0 ? [] : next);
    } else {
      const idx = selectedIntegrations.indexOf(name);
      const next = idx >= 0 ? selectedIntegrations.filter((n) => n !== name) : [...selectedIntegrations, name];
      setSelectedIntegrations(next.length === 0 ? null : next);
      setStoredIntegrationFilter(next.length === 0 ? [] : next);
    }
  };

  const showAll = () => {
    setSelectedIntegrations(null);
    try {
      localStorage.removeItem(INTEGRATIONS_FILTER_KEY);
    } catch {}
  };

  return (
    <section className="card stack" style={{ padding: 0 }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.25rem 1.25rem 0.75rem",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
        onClick={() => setListExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setListExpanded((e) => !e)}
        aria-expanded={listExpanded}
      >
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span
            className="muted"
            style={{ fontSize: "0.875rem", transform: listExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            aria-hidden
          >
            &gt;
          </span>
          <h3 style={{ margin: 0 }}>Internal signal</h3>
          {!loading && filteredEvents.length > 0 && (
            <span className="badge" style={{ flexShrink: 0 }}>{filteredEvents.length}</span>
          )}
        </div>
        <div className="row" style={{ gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }} onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => { setConfigOpen((o) => !o); setListExpanded(true); }}
            aria-expanded={configOpen}
          >
            Configure integrations
          </button>
          <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={autoScan}
              onChange={handleToggleAutoScan}
              aria-label="Auto scan"
            />
            <span className={autoScan ? "" : "muted"}>Auto scan</span>
          </label>
          {autoScan ? (
            <span className="muted text-sm">{syncing ? "Scanning…" : `Auto scan every ${intervalMinutes} min`}</span>
          ) : (
            <button type="button" className="btn primary btn-sm" onClick={() => runIngest()} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync from Zapier"}
            </button>
          )}
        </div>
      </div>

      {configOpen && (
        <div className="card-flat stack-sm" style={{ margin: "0 1.25rem 0.75rem", padding: "0.75rem", borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-medium" style={{ margin: 0 }}>Auto scan interval</p>
          <p className="text-sm muted" style={{ margin: "0.25rem 0 0 0" }}>How often to sync from Zapier when Auto scan is on.</p>
          <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={intervalMinutes === opt.value ? "btn primary btn-sm" : "btn secondary btn-sm"}
                onClick={() => {
                  setIntervalMinutes(opt.value);
                  setStoredInternalConfig({ intervalMinutes: opt.value });
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Integrations to show</p>
          <p className="text-sm muted" style={{ margin: "0.25rem 0 0 0" }}>Choose which integrations to display in the list below. Uncheck to hide that source.</p>
          <p className="text-xs muted" style={{ margin: "0.25rem 0 0 0" }}>
            For recent emails: add <strong>Gmail: Find Email</strong> or <strong>Gmail: Search Emails</strong> to input context. Avoid &ldquo;Get Attachment by Filename&rdquo;—it only retrieves one attachment by name and cannot list emails.
          </p>
          {integrations.length === 0 ? (
            <p className="muted text-xs" style={{ margin: "0.5rem 0 0" }}>No input-context tools saved yet. Go to Dashboard → Integrations, connect Zapier, and add tools (e.g. Gmail: Find Email) to the input context zone, then Save.</p>
          ) : (
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {integrations.map((name) => (
                <label
                  key={name}
                  className="row"
                  style={{ alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.8125rem", margin: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={!displaySet || displaySet.has(name)}
                    onChange={() => toggleIntegration(name)}
                  />
                  <span>{name}</span>
                </label>
              ))}
              {displaySet && displaySet.size < integrations.length && (
                <button type="button" className="btn secondary btn-sm" onClick={showAll}>
                  Show all
                </button>
              )}
            </div>
          )}
          <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Remove all</p>
          <p className="text-sm muted" style={{ margin: "0.25rem 0 0 0" }}>Clear all ingested internal signals for this company.</p>
          <button
            type="button"
            className="btn secondary btn-sm"
            style={{ marginTop: "0.35rem" }}
            disabled={clearingAll || events.length === 0}
            onClick={async () => {
              if (clearingAll || events.length === 0) return;
              setClearingAll(true);
              try {
                const res = await fetch("/api/risk/events", { method: "DELETE" });
                if (res.ok) await fetchEvents();
              } finally {
                if (mounted.current) setClearingAll(false);
              }
            }}
          >
            {clearingAll ? "Removing…" : "Remove all signals"}
          </button>
        </div>
      )}

      {listExpanded && (
        <>
      {error && (
        <div className="card-flat stack-xs" style={{ margin: "0.75rem", padding: "0.5rem 0.75rem", borderColor: "var(--danger)" }}>
          <p className="text-sm" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
          <p className="muted text-xs" style={{ margin: 0 }}>Connect Zapier and assign input-context tools in Dashboard → Integrations.</p>
        </div>
      )}

      <div className="stack-sm" style={{ padding: "0.75rem 1.25rem 1.25rem", maxHeight: "40vh", overflowY: "auto" }}>
        {loading ? (
          <p className="muted text-sm">Loading…</p>
        ) : filteredEvents.length === 0 ? (
          <div className="stack-xs">
            <p className="muted text-sm">
              {events.length === 0
                ? "No events yet. Turn on Auto scan or Sync from Zapier. For email, use Gmail: Find Email or Gmail: Search Emails in input context (not Get Attachment by Filename)."
                : "No events match the selected integrations. Change filters above or show all."}
            </p>
            {lastSyncTools && lastSyncTools.length > 0 && (
              <p className="text-xs muted" style={{ marginTop: "0.25rem" }}>
                Last sync: {lastSyncTools.map((t) => `${t.name}: ${t.status === "error" ? "error" : t.status === "empty" ? "0 items" : `${t.count} item${t.count !== 1 ? "s" : ""}`}`).join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <>
            {onAddToAssessment && (
              <div className="row" style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() =>
                    filteredEvents.forEach((ev) =>
                      onAddToAssessment({
                        id: `internal-${ev.id}`,
                        type: "internal",
                        summary: `${ev.source || ev.toolName}: ${ev.signal.slice(0, 60)}${ev.signal.length > 60 ? "…" : ""}`,
                        internalPayload: { signal: ev.signal, source: ev.source, toolName: ev.toolName },
                      })
                    )
                  }
                >
                  Add all to risk assessment
                </button>
              </div>
            )}
            {filteredEvents.map((ev) => (
            <InternalSignalRow
              key={ev.id}
              ev={ev}
              onDelete={fetchEvents}
              onAddToAssessment={onAddToAssessment}
            />
            ))}
          </>
        )}
      </div>
        </>
      )}
    </section>
  );
}
