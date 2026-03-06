"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedSignal } from "./types";

const EXTERNAL_AUTO_SCAN_STORAGE_KEY = "risk-external-auto-scan";
const EXTERNAL_CONFIG_KEY = "risk-external-config";

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
] as const;

type ExternalSignalItem = {
  id?: string;
  title: string;
  snippet: string;
  url?: string;
  source?: string;
  createdAt?: string;
};

type Props = {
  onAddToAssessment?: (item: SelectedSignal) => void;
};

function getStoredExternalAutoScan(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(EXTERNAL_AUTO_SCAN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type ExternalConfig = { intervalMinutes: number };

function getStoredExternalConfig(): ExternalConfig {
  if (typeof window === "undefined") return { intervalMinutes: 5 };
  try {
    const raw = localStorage.getItem(EXTERNAL_CONFIG_KEY);
    if (!raw) return { intervalMinutes: 5 };
    const parsed = JSON.parse(raw) as { intervalMinutes?: number };
    const min = parsed?.intervalMinutes;
    if (typeof min === "number" && INTERVAL_OPTIONS.some((o) => o.value === min)) return { intervalMinutes: min };
    return { intervalMinutes: 5 };
  } catch {
    return { intervalMinutes: 5 };
  }
}

function setStoredExternalConfig(config: ExternalConfig) {
  try {
    localStorage.setItem(EXTERNAL_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

function formatPulledTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ExternalSignalRow({
  signal: s,
  index: i,
  onAddToAssessment,
  onDelete,
}: {
  signal: ExternalSignalItem;
  index: number;
  onAddToAssessment?: (item: SelectedSignal) => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!s.id || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/risk/external-signals/${s.id}`, { method: "DELETE" });
      if (res.ok) onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const id = s.id ?? `ext-${i}-${(s.title || "").slice(0, 40).replace(/\s+/g, "-")}`;

  return (
    <li className="trace-row">
      <div className="trace-meta">
        <span className="font-semibold text-sm" style={{ color: "var(--accent-text)" }}>{s.title}</span>
        {s.source && <span className="badge">{s.source}</span>}
      </div>
      <p className="text-sm muted" style={{ lineHeight: 1.5, margin: 0 }}>{s.snippet}</p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <span>
          <a
            href={s.url || `https://www.google.com/search?q=${encodeURIComponent(s.title || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ color: "var(--accent-text)" }}
          >
            Read more
          </a>
        </span>
        <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
          {onAddToAssessment && (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() =>
                onAddToAssessment({
                  id,
                  type: "external",
                  summary: `${s.title}: ${(s.snippet || "").slice(0, 80)}`,
                  externalPayload: { title: s.title, snippet: s.snippet, source: s.source },
                })
              }
            >
              Add to risk assessment
            </button>
          )}
          {s.id && (
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
          )}
        </div>
      </div>
    </li>
  );
}

export function ExternalSignalSection({ onAddToAssessment }: Props) {
  const [signals, setSignals] = useState<ExternalSignalItem[]>([]);
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [autoScan, setAutoScan] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [clearingAll, setClearingAll] = useState(false);
  const mounted = useRef(true);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/risk/external-signals");
      const data = await res.json().catch(() => ({}));
      if (!mounted.current) return;
      if (!res.ok) {
        setError(data.error || "Failed to load external signals");
        setSignals([]);
        return;
      }
      setSignals((data.signals || []) as ExternalSignalItem[]);
      setPulledAt(data.pulledAt || null);
    } catch {
      if (mounted.current) {
        setError("Failed to load external signals");
        setSignals([]);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const pullFromWeb = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/risk/external-signals", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!mounted.current) return;
      if (!res.ok) {
        setError(data.error || "Failed to pull external signals");
        return;
      }
      setSignals((data.signals || []) as ExternalSignalItem[]);
      setPulledAt(data.pulledAt || null);
    } catch {
      if (mounted.current) setError("Failed to pull external signals");
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setAutoScan(getStoredExternalAutoScan());
    setIntervalMinutes(getStoredExternalConfig().intervalMinutes);
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    if (!autoScan) return;
    pullFromWeb();
    const ms = intervalMinutes * 60 * 1000;
    const t = setInterval(() => {
      if (mounted.current) pullFromWeb();
    }, ms);
    return () => clearInterval(t);
  }, [autoScan, intervalMinutes, pullFromWeb]);

  const handleToggleAutoScan = () => {
    const next = !autoScan;
    setAutoScan(next);
    try {
      localStorage.setItem(EXTERNAL_AUTO_SCAN_STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  const handlePullManual = () => {
    pullFromWeb();
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
        }}
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <span
            className="muted"
            style={{ fontSize: "0.875rem", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
            aria-hidden
          >
            &gt;
          </span>
          <h3 style={{ margin: 0 }}>External signal</h3>
          {!loading && signals.length > 0 && (
            <span className="badge" style={{ flexShrink: 0 }}>{signals.length}</span>
          )}
          {pulledAt && !loading && (
            <span className="muted text-xs" style={{ flexShrink: 0 }} title={new Date(pulledAt).toLocaleString()}>
              Pulled {formatPulledTime(pulledAt)}
            </span>
          )}
        </div>
        <div className="row" style={{ gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }} onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => { setConfigOpen((o) => !o); setExpanded(true); }}
            aria-expanded={configOpen}
          >
            Configure external signal
          </button>
          <label className="row" style={{ alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={autoScan}
              onChange={handleToggleAutoScan}
              aria-label="Auto scan external signals"
            />
            <span className={autoScan ? "" : "muted"}>Auto scan</span>
          </label>
          {autoScan ? (
            <span className="muted text-sm">{refreshing ? "Pulling…" : `Auto pulling every ${intervalMinutes} min`}</span>
          ) : (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={handlePullManual}
              disabled={refreshing}
            >
              {refreshing ? "Pulling…" : "Pull from web"}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <>
          <p className="muted text-sm" style={{ margin: 0, padding: "0.5rem 1.25rem 0", borderBottom: "1px solid var(--border)" }}>
            News and web articles (supply chain disruptions, disasters, geopolitics, labor, cyber). Each pull adds new signals; previous ones are kept.
          </p>
          {configOpen && (
            <div className="card-flat stack-sm" style={{ margin: "0 1.25rem 0.75rem", padding: "0.75rem", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm muted" style={{ margin: 0 }}>Auto pull interval: how often to fetch new external signals when Auto scan is on.</p>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={intervalMinutes === opt.value ? "btn primary btn-sm" : "btn secondary btn-sm"}
                    onClick={() => {
                      setIntervalMinutes(opt.value);
                      setStoredExternalConfig({ intervalMinutes: opt.value });
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Remove all</p>
              <p className="text-sm muted" style={{ margin: "0.25rem 0 0 0" }}>Clear all saved external signals for this company.</p>
              <button
                type="button"
                className="btn secondary btn-sm"
                style={{ marginTop: "0.35rem" }}
                disabled={clearingAll || signals.length === 0}
                onClick={async () => {
                  if (clearingAll || signals.length === 0) return;
                  setClearingAll(true);
                  try {
                    const res = await fetch("/api/risk/external-signals", { method: "DELETE" });
                    if (res.ok) await loadSaved();
                  } finally {
                    if (mounted.current) setClearingAll(false);
                  }
                }}
              >
                {clearingAll ? "Removing…" : "Remove all signals"}
              </button>
            </div>
          )}
          {error && (
            <div className="card-flat stack-xs" style={{ margin: "0.75rem", padding: "0.5rem 0.75rem", borderColor: "var(--danger)" }}>
              <p className="text-sm" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          )}
          <div className="stack-sm" style={{ padding: "0.75rem 1.25rem 1.25rem", maxHeight: "40vh", overflowY: "auto" }}>
            {loading ? (
              <p className="muted text-sm">Loading…</p>
            ) : signals.length === 0 ? (
              <p className="muted text-sm">
                {autoScan ? "No external signals yet. Auto scan will keep pulling from the web." : "No external signals. Turn on Auto scan or click &ldquo;Pull from web&rdquo; to fetch news."}
              </p>
            ) : (
              <>
                {onAddToAssessment && (
                  <div className="row" style={{ marginBottom: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() =>
                        signals.forEach((s, i) => {
                          onAddToAssessment({
                            id: s.id ?? `ext-${i}-${(s.title || "").slice(0, 40).replace(/\s+/g, "-")}`,
                            type: "external",
                            summary: `${s.title}: ${(s.snippet || "").slice(0, 80)}`,
                            externalPayload: { title: s.title, snippet: s.snippet, source: s.source },
                          });
                        })
                      }
                    >
                      Add all to risk assessment
                    </button>
                  </div>
                )}
                <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {signals.map((s, i) => (
                  <ExternalSignalRow
                    key={s.id ?? `ext-${i}-${(s.title || "").slice(0, 40)}`}
                    signal={s}
                    index={i}
                    onAddToAssessment={onAddToAssessment}
                    onDelete={loadSaved}
                  />
                ))}
              </ul>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
