"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { groupToolsByApp } from "@/lib/integration-tool-hint";
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
  onRequestDelete,
}: {
  signal: ExternalSignalItem;
  index: number;
  onAddToAssessment?: (item: SelectedSignal) => void;
  onRequestDelete?: (id: string) => void;
}) {
  const id = s.id ?? `ext-${i}-${(s.title || "").slice(0, 40).replace(/\s+/g, "-")}`;

  return (
    <li className="trace-row">
      <div className="trace-meta">
        <span className="trace-title text-sm">{s.title}</span>
        {s.source && <span className="badge">{s.source}</span>}
      </div>
      <p className="text-sm muted">{s.snippet}</p>
      <div className="trace-actions">
        <span>
          <a
            href={s.url || `https://www.google.com/search?q=${encodeURIComponent(s.title || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs link-accent"
          >
            Read more
          </a>
        </span>
        <div className="row gap-xs">
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
          {s.id && onRequestDelete && (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() => onRequestDelete(s.id!)}
              title="Remove this signal"
              aria-label="Remove signal"
            >
              Remove
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
  const [confirmDelete, setConfirmDelete] = useState<null | { type: "one"; id: string } | { type: "all" }>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configuredTools, setConfiguredTools] = useState<string[]>([]);
  const mounted = useRef(true);

  const fetchToolSelections = useCallback(async () => {
    try {
      const res = await fetch("/api/zapier/tool-selections");
      const data = await res.json().catch(() => ({}));
      if (!mounted.current) return;
      if (res.ok && Array.isArray(data.inputContextTools)) {
        setConfiguredTools(data.inputContextTools);
      }
    } catch { /* ignore */ }
  }, []);

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

  const onConfirmDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === "one") {
      setDeletingId(confirmDelete.id);
      try {
        const res = await fetch(`/api/risk/external-signals/${confirmDelete.id}`, { method: "DELETE" });
        if (res.ok) await loadSaved();
      } finally {
        if (mounted.current) setDeletingId(null);
        setConfirmDelete(null);
      }
    } else {
      setClearingAll(true);
      try {
        const res = await fetch("/api/risk/external-signals", { method: "DELETE" });
        if (res.ok) await loadSaved();
      } finally {
        if (mounted.current) setClearingAll(false);
        setConfirmDelete(null);
      }
    }
  }, [confirmDelete, loadSaved]);

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
    fetchToolSelections();
  }, [fetchToolSelections]);

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

  const confirmDeleteOpen = confirmDelete !== null;
  const confirmDeleteTitle = confirmDelete?.type === "one" ? "Remove signal" : confirmDelete?.type === "all" ? "Remove all signals" : "";
  const confirmDeleteMessage =
    confirmDelete?.type === "one"
      ? "Remove this external signal from the list?"
      : confirmDelete?.type === "all"
        ? "Clear all saved external signals for this company? This cannot be undone."
        : "";
  const confirmDeleteLoading = (confirmDelete?.type === "one" && deletingId === confirmDelete.id) || (confirmDelete?.type === "all" && clearingAll);

  return (
    <section className="card stack collapsible-card">
      <ConfirmModal
        open={confirmDeleteOpen}
        title={confirmDeleteTitle}
        message={confirmDeleteMessage}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        loading={confirmDeleteLoading}
        onConfirm={onConfirmDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
      <div
        className="collapsible-card__header"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="collapsible-card__title">
          <span
            className="collapsible-card__chevron"
            aria-expanded={expanded}
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
        <div className="collapsible-card__header-actions" onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => { setConfigOpen((o) => !o); setExpanded(true); }}
            aria-expanded={configOpen}
          >
            Configure
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
              className="btn primary btn-sm"
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
          {configOpen && (
            <div className="card-flat stack-sm" style={{ margin: "0 1.25rem 0.5rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
              <p className="text-sm font-medium" style={{ margin: 0 }}>Auto scan interval</p>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
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
              <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Input context tools</p>
              <p className="text-xs muted" style={{ margin: "0.25rem 0 0 0" }}>Tools used for external signal context. Manage in Dashboard → Integrations.</p>
              {configuredTools.length === 0 ? (
                <p className="muted text-xs" style={{ margin: "0.35rem 0 0 0" }}>None configured.</p>
              ) : (
                <div className="integrations-zone__list" style={{ marginTop: "0.35rem", maxHeight: 220 }}>
                  {groupToolsByApp(configuredTools.map((name) => ({ name }))).map(({ appKey, appLabel, tools: appTools }) => (
                    <details key={appKey} className="integrations-zone__group">
                      <summary className="integrations-zone__group-summary" onClick={(e) => e.stopPropagation()}>
                        <span className="integrations-zone__group-title">{appLabel}</span>
                        <span className="integrations-zone__group-meta">{appTools.length}</span>
                      </summary>
                      {appTools.map((tool) => (
                        <div key={tool.name} className="integrations-zone__item" style={{ cursor: "default" }}>
                          <span className="integrations-zone__item-text">{tool.name}</span>
                        </div>
                      ))}
                    </details>
                  ))}
                </div>
              )}
              <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Remove all</p>
              <button
                type="button"
                className="btn secondary btn-sm"
                style={{ marginTop: "0.35rem" }}
                disabled={clearingAll || signals.length === 0}
                onClick={() => signals.length > 0 && setConfirmDelete({ type: "all" })}
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
          <div className="stack-sm collapsible-card__body scroll-40vh">
            {loading ? (
              <p className="muted text-sm">Loading…</p>
            ) : signals.length === 0 ? (
              <p className="muted text-sm">
                {autoScan ? "No signals yet. Auto scan is on." : "No signals. Turn on Auto scan or Pull from web."}
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
                    onRequestDelete={(id) => setConfirmDelete({ type: "one", id })}
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
