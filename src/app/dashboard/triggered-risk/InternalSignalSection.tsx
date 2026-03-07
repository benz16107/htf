"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { groupToolsByApp } from "@/lib/integration-tool-hint";
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

type EventDetails = {
  rawContent: unknown;
  externalId?: string | null;
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

function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickObject(obj: unknown, key: string): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function getEmailDetails(raw: unknown): { subject?: string; from?: string; to?: string; date?: string; snippet?: string; body?: string } {
  if (!raw || typeof raw !== "object") return {};
  const subject = pickString(raw, ["subject", "title"]);

  const fromObj = pickObject(raw, "from") ?? pickObject(raw, "sender");
  const from =
    pickString(fromObj, ["email", "address", "name"]) ??
    pickString(raw, ["from", "sender", "from_email", "fromEmail"]);

  const toObj = pickObject(raw, "to");
  const to =
    pickString(toObj, ["email", "address", "name"]) ??
    pickString(raw, ["to", "to_email", "toEmail", "recipient"]);

  const date = pickString(raw, ["date", "internalDate", "sent_at", "sentAt", "received_at", "receivedAt"]);
  const snippet = pickString(raw, ["snippet", "preview", "summary"]);
  const body =
    pickString(raw, [
      "body",
      "body_plain",
      "bodyPlain",
      "textBody",
      "plainText",
      "message",
      "text",
      "plain",
      "content",
      "html",
    ]) ??
    pickString(pickObject(raw, "payload"), [
      "body",
      "body_plain",
      "bodyPlain",
      "textBody",
      "plainText",
      "message",
      "text",
      "plain",
      "content",
      "html",
    ]);

  return { subject: subject ?? undefined, from: from ?? undefined, to: to ?? undefined, date: date ?? undefined, snippet: snippet ?? undefined, body: body ?? undefined };
}

function safePrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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
  onRequestDelete,
  onAddToAssessment,
}: {
  ev: EventItem;
  onRequestDelete?: (id: string) => void;
  onAddToAssessment?: (item: SelectedSignal) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [details, setDetails] = useState<EventDetails | null>(null);

  const loadDetails = async () => {
    if (detailsLoading || details) return;
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const res = await fetch(`/api/risk/events/${ev.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailsError(data.error || "Failed to load details");
        return;
      }
      setDetails({ rawContent: data?.event?.rawContent, externalId: data?.event?.externalId });
    } catch {
      setDetailsError("Failed to load details");
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="trace-row">
      <div className="trace-meta">
        <span className="trace-title text-sm">{ev.source}</span>
        <span className="muted text-xs">{ev.time}</span>
      </div>
      <p className="text-sm">&ldquo;{ev.signal}&rdquo;</p>
      <div className="trace-actions">
        <span className="badge">From {ev.toolName}</span>
        <div className="row gap-xs">
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={async () => {
              const next = !detailsOpen;
              setDetailsOpen(next);
              if (next) await loadDetails();
            }}
          >
            {detailsOpen ? "Hide details" : "Show details"}
          </button>
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
          {onRequestDelete && (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() => onRequestDelete(ev.id)}
              title="Remove this signal"
              aria-label="Remove signal"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {detailsOpen && (
        <div className="card-flat stack-xs mt-xs" style={{ padding: "0.6rem 0.75rem" }}>
          {detailsLoading ? (
            <p className="muted text-sm" style={{ margin: 0 }}>Loading details…</p>
          ) : detailsError ? (
            <p className="text-sm" style={{ color: "var(--danger)", margin: 0 }}>{detailsError}</p>
          ) : (
            (() => {
              const raw = details?.rawContent;
              const email = getEmailDetails(raw);
              const hasEmailFields = Boolean(email.subject || email.from || email.to || email.date || email.snippet || email.body);
              return (
                <div className="stack-xs">
                  {details?.externalId && (
                    <p className="muted text-xs" style={{ margin: 0 }}>External id: {details.externalId}</p>
                  )}

                  {hasEmailFields && (
                    <div className="stack-xs">
                      {email.subject && <p className="text-sm" style={{ margin: 0 }}><strong>Subject:</strong> {email.subject}</p>}
                      {email.from && <p className="text-sm" style={{ margin: 0 }}><strong>From:</strong> {email.from}</p>}
                      {email.to && <p className="text-sm" style={{ margin: 0 }}><strong>To:</strong> {email.to}</p>}
                      {email.date && <p className="text-sm" style={{ margin: 0 }}><strong>Date:</strong> {email.date}</p>}
                      {email.snippet && <p className="text-sm" style={{ margin: 0 }}><strong>Snippet:</strong> {email.snippet}</p>}
                      {email.body && (
                        <div className="stack-xs">
                          <p className="text-sm" style={{ margin: 0 }}><strong>Body:</strong></p>
                          <pre className="code-block soft scroll-240">
                            {email.body}
                          </pre>
                        </div>
                      )}
                      {!email.body && (
                        <p className="muted text-xs" style={{ margin: "0.25rem 0 0 0" }}>
                          Message content isn’t available for this item (some email tools only return a snippet). Run “Sync from Zapier” again after the updated Gmail retrieval to store full bodies for new events.
                        </p>
                      )}
                    </div>
                  )}

                  <details className="inline-details">
                    <summary className="muted text-xs">Raw payload</summary>
                    <pre className="code-block soft scroll-260" style={{ marginTop: "0.35rem" }}>
                      {safePrettyJson(raw)}
                    </pre>
                  </details>
                </div>
              );
            })()
          )}
        </div>
      )}
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
  const [confirmDelete, setConfirmDelete] = useState<null | { type: "one"; id: string } | { type: "all" }>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const onConfirmDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === "one") {
      setDeletingId(confirmDelete.id);
      try {
        const res = await fetch(`/api/risk/events/${confirmDelete.id}`, { method: "DELETE" });
        if (res.ok) await fetchEvents();
      } finally {
        if (mounted.current) setDeletingId(null);
        setConfirmDelete(null);
      }
    } else {
      setClearingAll(true);
      try {
        const res = await fetch("/api/risk/events", { method: "DELETE" });
        if (res.ok) await fetchEvents();
      } finally {
        if (mounted.current) setClearingAll(false);
        setConfirmDelete(null);
      }
    }
  }, [confirmDelete, fetchEvents]);

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

  const confirmDeleteOpen = confirmDelete !== null;
  const confirmDeleteTitle = confirmDelete?.type === "one" ? "Remove signal" : confirmDelete?.type === "all" ? "Remove all signals" : "";
  const confirmDeleteMessage =
    confirmDelete?.type === "one"
      ? "Remove this internal signal from the list?"
      : confirmDelete?.type === "all"
        ? "Clear all ingested internal signals for this company? This cannot be undone."
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
        onClick={() => setListExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && setListExpanded((e) => !e)}
        aria-expanded={listExpanded}
      >
        <div className="collapsible-card__title">
          <span
            className="collapsible-card__chevron"
            aria-expanded={listExpanded}
            aria-hidden
          >
            &gt;
          </span>
          <h3 style={{ margin: 0 }}>Internal signal</h3>
          {!loading && filteredEvents.length > 0 && (
            <span className="badge" style={{ flexShrink: 0 }}>{filteredEvents.length}</span>
          )}
        </div>
        <div className="collapsible-card__header-actions" onClick={(ev) => ev.stopPropagation()}>
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => { setConfigOpen((o) => !o); setListExpanded(true); }}
            aria-expanded={configOpen}
          >
            Configure
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
                  setStoredInternalConfig({ intervalMinutes: opt.value });
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Integrations to show</p>
          {integrations.length === 0 ? (
            <p className="muted text-xs" style={{ margin: "0.25rem 0 0 0" }}>Add tools in Dashboard → Integrations (input context), then Save.</p>
          ) : (
            <div className="integrations-zone__list" style={{ maxHeight: 220 }}>
              {groupToolsByApp(integrations.map((name) => ({ name }))).map(({ appKey, appLabel, tools: appTools }) => {
                const names = new Set(appTools.map((t) => t.name));
                const selectedInGroup = displaySet ? appTools.filter((t) => displaySet.has(t.name)).length : appTools.length;
                return (
                  <details key={appKey} className="integrations-zone__group">
                    <summary className="integrations-zone__group-summary" onClick={(e) => e.stopPropagation()}>
                      <span className="integrations-zone__group-title">{appLabel}</span>
                      <span className="integrations-zone__group-meta">
                        {displaySet ? `${selectedInGroup}/${appTools.length}` : `${appTools.length}/${appTools.length}`}
                      </span>
                      <span className="integrations-zone__group-actions">
                        <button
                          type="button"
                          className="btn secondary btn-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const base = selectedIntegrations ?? integrations;
                            const next = Array.from(new Set([...base, ...names]));
                            setSelectedIntegrations(next);
                            setStoredIntegrationFilter(next);
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
                            const base = selectedIntegrations ?? integrations;
                            const next = base.filter((n) => !names.has(n));
                            setSelectedIntegrations(next.length === 0 ? null : next);
                            setStoredIntegrationFilter(next.length === 0 ? [] : next);
                          }}
                        >
                          Clear
                        </button>
                      </span>
                    </summary>
                    {appTools.map((tool) => (
                      <label
                        key={tool.name}
                        className="integrations-zone__item"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!displaySet || displaySet.has(tool.name)}
                          onChange={() => toggleIntegration(tool.name)}
                        />
                        <span className="integrations-zone__item-text">{tool.name}</span>
                      </label>
                    ))}
                  </details>
                );
              })}
            </div>
          )}
          {displaySet && displaySet.size < integrations.length && (
            <button type="button" className="btn secondary btn-sm" style={{ marginTop: "0.5rem" }} onClick={showAll}>
              Show all
            </button>
          )}
          <p className="text-sm font-medium" style={{ margin: "0.75rem 0 0 0" }}>Remove all</p>
          <button
            type="button"
            className="btn secondary btn-sm"
            style={{ marginTop: "0.35rem" }}
            disabled={clearingAll || events.length === 0}
            onClick={() => events.length > 0 && setConfirmDelete({ type: "all" })}
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
        </div>
      )}

      <div className="stack-sm collapsible-card__body scroll-40vh">
        {loading ? (
          <p className="muted text-sm">Loading…</p>
        ) : filteredEvents.length === 0 ? (
          <div className="stack-xs">
            <p className="muted text-sm">
              {events.length === 0 ? "No events. Turn on Auto scan or Sync from Zapier." : "No events match filters. Show all or change selection."}
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
              onRequestDelete={(id) => setConfirmDelete({ type: "one", id })}
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
