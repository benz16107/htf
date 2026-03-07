"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/components/ConfirmModal";

const POLL_INTERVAL_MS = 2000;

type SignalExpanded = {
  type: "internal" | "external";
  source?: string;
  toolName?: string;
  signalSummary?: string | null;
  title?: string;
  snippet?: string;
  url?: string | null;
  rawContent?: unknown;
};

type RiskCaseExpanded = {
  id: string;
  triggerType: string;
  createdByAutonomousAgent?: boolean;
  entityMap: unknown;
  timeWindow: unknown;
  probabilityPoint: number | null;
  probabilityBandLow: number | null;
  probabilityBandHigh: number | null;
  confidenceLevel: string | null;
  keyDrivers: unknown;
  severity: string | null;
  serviceImpact: unknown;
  financialImpact: unknown;
  scenarios: Array<{ id: string; name: string; recommendation: string }>;
};

type PlanExpanded = {
  id: string;
  status: string;
  executionMode: string;
  actions: unknown;
  riskCaseTriggerType?: string;
  createdByAutonomousAgent?: boolean;
};

type LogEntry = {
  id: string;
  runId: string;
  actionType: string;
  signalType: string | null;
  signalId: string | null;
  riskCaseId: string | null;
  planId: string | null;
  summary: string | null;
  details: unknown;
  createdAt: string;
  signal?: SignalExpanded;
  riskCase?: RiskCaseExpanded;
  plan?: PlanExpanded;
};

type RunLog = { runId: string; entries: LogEntry[] };

function toPercent(n: number): number {
  if (n > 1) return Math.min(100, Math.max(0, n));
  return Math.min(100, Math.max(0, n * 100));
}

function actionLabel(actionType: string): string {
  const map: Record<string, string> = {
    run_started: "Run started",
    run_completed: "Run completed",
    signal_assessed: "Assessed",
    signal_skipped: "Skipped",
    risk_case_created: "Risk case created",
    plan_drafted: "Plan drafted",
    plan_executed: "Plan executed",
  };
  return map[actionType] ?? actionType;
}

function actionBadgeClass(actionType: string): string {
  if (actionType === "run_started" || actionType === "run_completed") return "badge accent";
  if (actionType === "signal_skipped") return "badge";
  if (actionType === "signal_assessed") return "badge";
  if (actionType === "risk_case_created") return "badge success";
  if (actionType === "plan_drafted") return "badge success";
  if (actionType === "plan_executed") return "badge success";
  return "badge";
}

function severityColor(severity: string | undefined): string {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical") return "var(--danger)";
  if (s === "severe") return "var(--warning)";
  if (s === "moderate") return "var(--caution)";
  return "var(--muted)";
}

/** Partition run entries into run-level (no case) and groups by riskCaseId. */
function groupEntriesByCase(entries: LogEntry[]): {
  runLevel: LogEntry[];
  caseGroups: Map<string, LogEntry[]>;
} {
  const runLevel: LogEntry[] = [];
  const caseGroups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    if (e.riskCaseId) {
      const list = caseGroups.get(e.riskCaseId) ?? [];
      list.push(e);
      caseGroups.set(e.riskCaseId, list);
    } else {
      runLevel.push(e);
    }
  }
  return { runLevel, caseGroups };
}

export function AgentTracesClient() {
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [confirmDeleteCaseId, setConfirmDeleteCaseId] = useState<string | null>(null);

  const deleteCase = async (riskCaseId: string) => {
    if (deletingCaseId) return;
    setDeletingCaseId(riskCaseId);
    try {
      const res = await fetch(`/api/risk/cases/${riskCaseId}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDeleteCaseId(null);
        await fetchLogs();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete case");
      }
    } finally {
      setDeletingCaseId(null);
    }
  };

  const deleteRun = async (runId: string) => {
    if (deletingRunId) return;
    setDeletingRunId(runId);
    try {
      const res = await fetch(`/api/agents/autonomous/logs?runId=${encodeURIComponent(runId)}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDeleteRunId(null);
        await fetchLogs();
      }
    } finally {
      setDeletingRunId(null);
    }
  };

  const toggleCase = (riskCaseId: string) => {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(riskCaseId)) next.delete(riskCaseId);
      else next.add(riskCaseId);
      return next;
    });
  };

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/autonomous/logs");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load logs");
      }
      const data = await res.json();
      setRunLogs(data.runLogs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const t = setInterval(fetchLogs, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchLogs]);

  if (loading && runLogs.length === 0) {
    return (
      <section className="card stack">
        <p className="muted">Loading Autonomous Agent…</p>
      </section>
    );
  }

  return (
    <>
      <ConfirmModal
        open={confirmDeleteRunId !== null}
        title="Delete all"
        message="Clear this run from history? This cannot be undone."
        confirmLabel="Delete all"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingRunId === confirmDeleteRunId}
        onConfirm={() => confirmDeleteRunId && deleteRun(confirmDeleteRunId)}
        onCancel={() => setConfirmDeleteRunId(null)}
      />
      <ConfirmModal
        open={confirmDeleteCaseId !== null}
        title="Delete case"
        message="Delete this risk case and its scenarios and plans? This cannot be undone."
        confirmLabel="Delete case"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingCaseId === confirmDeleteCaseId}
        onConfirm={() => confirmDeleteCaseId && deleteCase(confirmDeleteCaseId)}
        onCancel={() => setConfirmDeleteCaseId(null)}
      />
      {error && (
        <div className="card-flat" style={{ padding: "0.6rem 1rem", background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
      )}
      {runLogs.length === 0 ? (
        <section className="card stack">
          <div className="empty-state" style={{ padding: "2.25rem 1.25rem" }}>
            <h3 style={{ margin: 0 }}>No autonomous activity yet</h3>
            <p className="muted" style={{ margin: "0.5rem 0 0 0" }}>
              Use Agent settings (above) to turn on the agent or run now. Actions will appear here as they run.
            </p>
          </div>
        </section>
      ) : (
        <div className="stack-lg">
          <div className="row between" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <p className="text-xs muted" style={{ margin: 0 }}>
              Auto-refreshes every {POLL_INTERVAL_MS / 1000}s · Expand each risk case to see signal, assessment, draft, and execution
            </p>
            <div className="row gap-xs">
              <button
                type="button"
                className="btn secondary btn-xs"
                onClick={() => setExpandedCases(new Set(runLogs.flatMap((r) => [...groupEntriesByCase(r.entries).caseGroups.keys()])))}
              >
                Expand all cases
              </button>
              <button
                type="button"
                className="btn secondary btn-xs"
                onClick={() => setExpandedCases(new Set())}
              >
                Collapse all cases
              </button>
            </div>
          </div>
          {(() => {
            const latestRun = [...runLogs].sort((a, b) => {
              const aMax = Math.max(...a.entries.map((e) => new Date(e.createdAt).getTime()));
              const bMax = Math.max(...b.entries.map((e) => new Date(e.createdAt).getTime()));
              return bMax - aMax;
            })[0];
            const runsToShow = latestRun ? [latestRun] : [];
            return runsToShow.map(({ runId, entries }) => {
            const { runLevel, caseGroups } = groupEntriesByCase(entries);
            const caseGroupsWithCase = [...caseGroups.entries()].filter(([, caseEntries]) =>
              caseEntries.some((e) => e.riskCase)
            );
            const runLevelFiltered = runLevel.filter(
              (log) => log.actionType !== "run_started" && log.actionType !== "run_completed"
            );
            return (
              <section key={runId} className="card stack collapsible-card">
                <div className="collapsible-card__header" style={{ cursor: "default" }}>
                  <div className="collapsible-card__title">
                    <h3 style={{ margin: 0 }}>Run</h3>
                    <span className="badge accent">{caseGroupsWithCase.length} risk case(s)</span>
                  </div>
                  <div className="collapsible-card__header-actions">
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteRunId(runId); }}
                      disabled={deletingRunId === runId}
                      title="Clear this run from history"
                    >
                      {deletingRunId === runId ? "…" : "Delete all"}
                    </button>
                  </div>
                </div>
                <div className="stack-sm collapsible-card__body">
                  {runLevelFiltered.length > 0 && (
                    <div className="stack-xs" style={{ marginBottom: "0.75rem" }}>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Run</p>
                      {runLevelFiltered.map((log) => (
                        <div key={log.id} className="trace-row row between gap-sm" style={{ alignItems: "center", flexWrap: "wrap" }}>
                          <div className="row gap-2xs" style={{ minWidth: 0, flexWrap: "wrap" }}>
                            <span className={actionBadgeClass(log.actionType)}>{actionLabel(log.actionType)}</span>
                            {log.summary && (
                              <span className="text-sm truncate" title={log.summary}>{log.summary}</span>
                            )}
                            {log.actionType === "signal_skipped" && (log.details as { reason?: string })?.reason && (
                              <span className="text-xs muted">{(log.details as { reason: string }).reason}</span>
                            )}
                            {log.actionType === "run_started" && (log.details as { hint?: string })?.hint && (
                              <span className="text-xs muted" style={{ display: "block", marginTop: "0.25rem" }}>
                                {(log.details as { hint: string }).hint}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {caseGroupsWithCase.map(([riskCaseId, caseEntries]) => {
                    const created = caseEntries.find((e) => e.actionType === "risk_case_created");
                    const signal =
                      created?.signal ??
                      caseEntries.map((e) => e.signal).find(Boolean);
                    const fromSignal =
                      signal?.type === "internal"
                        ? (signal.signalSummary?.trim() || undefined)
                        : (signal?.title?.trim() || undefined);
                    const fromCreatedSummary =
                      created?.summary?.trim() &&
                      !/^(plan\s+)?(drafted|executed)|run\s+(started|completed)$/i.test(created.summary.trim())
                        ? created.summary.trim()
                        : undefined;
                    const caseName =
                      fromSignal ??
                      fromCreatedSummary ??
                      created?.riskCase?.triggerType ??
                      riskCaseId.slice(0, 8);
                    const hasDrafted = caseEntries.some((e) => e.actionType === "plan_drafted");
                    const hasExecuted = caseEntries.some((e) => e.actionType === "plan_executed");
                    const riskCase = caseEntries.map((e) => e.riskCase).find(Boolean);
                    const plans = caseEntries
                      .filter((e) => e.plan)
                      .map((e) => e.plan!);
                    const executedPlans = plans.filter((p) => p.status === "EXECUTED");
                    const executedActions = executedPlans.flatMap((p) => (Array.isArray(p.actions) ? (p.actions as { stepTitle?: string; type?: string }[]) : []));
                    const executionBullets = executedActions
                      .map((a) => a.stepTitle?.trim() || a.type || "Step")
                      .filter(Boolean);
                    const planIds = caseEntries.filter((e) => e.planId).map((e) => e.planId!);
                    const latestPlanId = planIds[planIds.length - 1];
                    const isOpen = expandedCases.has(riskCaseId);

                    const riskOneLiner = riskCase
                      ? [
                          riskCase.severity && `Severity: ${riskCase.severity}`,
                          (riskCase.probabilityPoint != null || (riskCase.probabilityBandLow != null && riskCase.probabilityBandHigh != null))
                            ? `Probability: ${riskCase.probabilityPoint != null ? `${toPercent(riskCase.probabilityPoint).toFixed(0)}%` : `${toPercent(riskCase.probabilityBandLow!).toFixed(0)}–${toPercent(riskCase.probabilityBandHigh!).toFixed(0)}%`}`
                            : null,
                        ].filter(Boolean).join(" · ")
                      : null;

                    return (
                      <div key={riskCaseId} className="card-flat stack-sm" style={{ padding: 0, overflow: "hidden" }}>
                        <button
                          type="button"
                          className="row between gap-sm"
                          style={{
                            width: "100%",
                            padding: "0.75rem 1rem",
                            border: "none",
                            background: "var(--card-bg)",
                            cursor: "pointer",
                            textAlign: "left",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                          onClick={() => toggleCase(riskCaseId)}
                          aria-expanded={isOpen}
                        >
                          <div className="stack-2xs" style={{ minWidth: 0, flex: 1 }}>
                            <div className="row gap-2xs" style={{ flexWrap: "wrap", alignItems: "center" }}>
                              <span className="text-sm font-medium truncate" title={caseName}>{caseName}</span>
                              {riskCase?.createdByAutonomousAgent && (
                                <span className="badge" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>Autonomous</span>
                              )}
                              <span className="badge success">Created</span>
                              {hasDrafted && <span className="badge success">Drafted</span>}
                              {hasExecuted && <span className="badge success">Executed</span>}
                            </div>
                            {(fromSignal || riskOneLiner || executionBullets.length > 0) && (
                              <div className="stack-2xs text-xs muted" style={{ marginTop: "0.2rem" }}>
                                {fromSignal && (
                                  <span className="truncate" style={{ display: "block", maxWidth: "100%" }} title={fromSignal}>
                                    Signal: {fromSignal.length > 72 ? `${fromSignal.slice(0, 72)}…` : fromSignal}
                                  </span>
                                )}
                                {riskOneLiner && <span style={{ display: "block" }}>{riskOneLiner}</span>}
                                {executionBullets.length > 0 && (
                                  <ul className="list-reset" style={{ margin: 0, paddingLeft: 0 }}>
                                    {executionBullets.slice(0, 3).map((b, i) => (
                                      <li key={i} style={{ marginTop: "0.1rem" }}>• {b}</li>
                                    ))}
                                    {executionBullets.length > 3 && (
                                      <li style={{ marginTop: "0.1rem" }}>… +{executionBullets.length - 3} more</li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="muted text-xs" style={{ flexShrink: 0 }}>
                            {isOpen ? "▼" : "▶"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="stack-sm" style={{ padding: "0 1rem 1rem 1rem", borderTop: "1px solid var(--border)" }}>
                            {signal && (
                              <div className="card-flat stack-xs" style={{ padding: "0.75rem 1rem" }}>
                                <h4 className="text-sm font-semibold" style={{ margin: 0 }}>Signal</h4>
                                {signal.type === "internal" ? (
                                  <>
                                    <p className="text-xs muted" style={{ margin: 0 }}>{signal.source} · {signal.toolName}</p>
                                    {signal.signalSummary && (
                                      <p className="text-sm" style={{ margin: "0.35rem 0 0 0", whiteSpace: "pre-wrap" }}>{signal.signalSummary}</p>
                                    )}
                                    {signal.rawContent != null && (
                                      <details className="text-xs muted" style={{ marginTop: "0.5rem" }}>
                                        <summary>Raw content</summary>
                                        <pre className="text-xs" style={{ margin: "0.35rem 0 0 0", overflow: "auto", maxHeight: 200 }}>
                                          {typeof signal.rawContent === "string" ? signal.rawContent : JSON.stringify(signal.rawContent, null, 2)}
                                        </pre>
                                      </details>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-medium" style={{ margin: 0 }}>{signal.title}</p>
                                    {signal.snippet && <p className="text-sm" style={{ margin: "0.25rem 0 0 0" }}>{signal.snippet}</p>}
                                    {(signal.url || signal.source) && (
                                      <p className="text-xs muted" style={{ margin: "0.25rem 0 0 0" }}>
                                        {signal.source}
                                        {signal.url && (
                                          <a href={signal.url} target="_blank" rel="noopener noreferrer" className="btn link btn-xs" style={{ marginLeft: "0.5rem" }}>Link</a>
                                        )}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                            {riskCase && (
                              <div className="card-flat stack-sm" style={{ padding: "0.75rem 1rem" }}>
                                <h4 className="text-sm font-semibold" style={{ margin: 0 }}>Risk assessment</h4>
                                <div className="row gap-xs" style={{ alignItems: "center", flexWrap: "wrap", margin: "0.2rem 0 0 0" }}>
                                  <p className="text-sm font-medium" style={{ margin: 0 }}>{riskCase.triggerType}</p>
                                  {riskCase.createdByAutonomousAgent && (
                                    <span
                                      className="text-xs"
                                      style={{
                                        padding: "0.15rem 0.5rem",
                                        borderRadius: 4,
                                        background: "var(--warning-soft)",
                                        color: "var(--warning)",
                                      }}
                                      title="Created by autonomous agent"
                                    >
                                      Autonomous
                                    </span>
                                  )}
                                </div>
                                <div className="row" style={{ flexWrap: "wrap", gap: "1rem", marginTop: "0.5rem" }}>
                                  {riskCase.severity && (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Severity</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0", color: severityColor(riskCase.severity) }}>{riskCase.severity}</p>
                                    </div>
                                  )}
                                  {(riskCase.probabilityPoint != null || riskCase.probabilityBandLow != null) && (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Probability</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                                        {riskCase.probabilityPoint != null
                                          ? `${toPercent(riskCase.probabilityPoint).toFixed(0)}%`
                                          : riskCase.probabilityBandLow != null && riskCase.probabilityBandHigh != null
                                            ? `${toPercent(riskCase.probabilityBandLow).toFixed(0)}–${toPercent(riskCase.probabilityBandHigh).toFixed(0)}%`
                                            : "—"}
                                      </p>
                                    </div>
                                  )}
                                  {riskCase.confidenceLevel && (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Confidence</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>{riskCase.confidenceLevel}</p>
                                    </div>
                                  )}
                                  {riskCase.financialImpact && typeof riskCase.financialImpact === "object" &&
                                    ((riskCase.financialImpact as Record<string, unknown>).revenueAtRiskUsd != null || (riskCase.financialImpact as Record<string, unknown>).marginErosionPercent != null) ? (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Financial impact</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                                        {(riskCase.financialImpact as Record<string, unknown>).revenueAtRiskUsd != null && `$${Number((riskCase.financialImpact as Record<string, unknown>).revenueAtRiskUsd).toLocaleString()} at risk`}
                                        {(riskCase.financialImpact as Record<string, unknown>).revenueAtRiskUsd != null && (riskCase.financialImpact as Record<string, unknown>).marginErosionPercent != null && " · "}
                                        {(riskCase.financialImpact as Record<string, unknown>).marginErosionPercent != null && `${(riskCase.financialImpact as Record<string, unknown>).marginErosionPercent}% margin erosion`}
                                      </p>
                                    </div>
                                  ) : null}
                                  {riskCase.timeWindow && typeof riskCase.timeWindow === "object" &&
                                    ((riskCase.timeWindow as Record<string, unknown>).startDate || (riskCase.timeWindow as Record<string, unknown>).expectedDurationDays != null) ? (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Time window</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                                        {(riskCase.timeWindow as Record<string, unknown>).startDate != null ? String((riskCase.timeWindow as Record<string, unknown>).startDate) : null}
                                        {(riskCase.timeWindow as Record<string, unknown>).expectedDurationDays != null ? ` · ${(riskCase.timeWindow as Record<string, unknown>).expectedDurationDays} days` : null}
                                      </p>
                                    </div>
                                  ) : null}
                                  {riskCase.serviceImpact && typeof riskCase.serviceImpact === "object" &&
                                    ((riskCase.serviceImpact as Record<string, unknown>).severity || (riskCase.serviceImpact as Record<string, unknown>).timelineWeeks != null) ? (
                                    <div>
                                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Impact</p>
                                      <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                                        {(riskCase.serviceImpact as Record<string, unknown>).severity != null ? String((riskCase.serviceImpact as Record<string, unknown>).severity) : null}
                                        {(riskCase.serviceImpact as Record<string, unknown>).timelineWeeks != null ? ` · ${(riskCase.serviceImpact as Record<string, unknown>).timelineWeeks} wk` : null}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                                {Array.isArray(riskCase.keyDrivers) && (riskCase.keyDrivers as string[]).length > 0 && (
                                  <div style={{ marginTop: "0.5rem" }}>
                                    <p className="text-xs uppercase muted" style={{ margin: "0 0 0.25rem 0" }}>Key drivers</p>
                                    <ul className="text-sm" style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "disc" }}>
                                      {(riskCase.keyDrivers as string[]).map((d, i) => (
                                        <li key={i}>{typeof d === "string" ? d : String(d)}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {riskCase.scenarios.length > 0 && (
                                  <div style={{ marginTop: "0.5rem" }}>
                                    <p className="text-xs uppercase muted" style={{ margin: "0 0 0.25rem 0" }}>Scenarios</p>
                                    <ul className="text-sm" style={{ margin: 0, paddingLeft: "1.25rem" }}>
                                      {riskCase.scenarios.map((s) => (
                                        <li key={s.id}>{s.name} ({s.recommendation})</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                            {plans.map((plan) => (
                              <div key={plan.id} className="card-flat stack-sm" style={{ padding: "0.75rem 1rem" }}>
                                <h4 className="text-sm font-semibold" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                  Mitigation plan {plan.status === "EXECUTED" ? "(executed)" : plan.status === "DRAFTED" ? "(draft)" : `(${plan.status})`}
                                  {plan.createdByAutonomousAgent && (
                                    <span
                                      className="text-xs"
                                      style={{
                                        padding: "0.15rem 0.5rem",
                                        borderRadius: 4,
                                        background: "var(--warning-soft)",
                                        color: "var(--warning)",
                                      }}
                                      title="Created by autonomous agent"
                                    >
                                      Autonomous
                                    </span>
                                  )}
                                </h4>
                                {plan.riskCaseTriggerType && (
                                  <p className="text-xs muted" style={{ margin: 0 }}>{plan.riskCaseTriggerType}</p>
                                )}
                                <p className="text-xs muted" style={{ margin: 0 }}>Status: {plan.status} · Mode: {plan.executionMode}</p>
                                {Array.isArray(plan.actions) && (plan.actions as unknown[]).length > 0 && (
                                  <ul className="stack-xs" style={{ margin: "0.5rem 0 0 0", paddingLeft: "1rem", listStyle: "none" }}>
                                    {(plan.actions as { type?: string; stepTitle?: string; recipientOrEndpoint?: string; payloadOrBody?: string }[]).map((action, i) => (
                                      <li key={i} className="text-sm" style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.5rem" }}>
                                        <span className="font-medium">{action.stepTitle ?? `Step ${i + 1}`}</span>
                                        {action.type && <span className="muted text-xs" style={{ marginLeft: "0.35rem" }}>({action.type})</span>}
                                        {action.recipientOrEndpoint && (
                                          <p className="text-xs muted" style={{ margin: "0.15rem 0 0 0" }}>To: {action.recipientOrEndpoint}</p>
                                        )}
                                        {action.payloadOrBody && (
                                          <p className="text-xs" style={{ margin: "0.15rem 0 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>
                                            {action.payloadOrBody.length > 400 ? `${action.payloadOrBody.slice(0, 400)}…` : action.payloadOrBody}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                            {executionBullets.length > 0 && (
                              <div className="card-flat stack-xs" style={{ padding: "0.75rem 1rem" }}>
                                <h4 className="text-sm font-semibold" style={{ margin: 0 }}>Execution summary</h4>
                                <p className="text-xs muted" style={{ margin: "0.2rem 0 0 0" }}>What was executed for this case:</p>
                                <ul className="text-sm stack-2xs" style={{ margin: "0.35rem 0 0 0", paddingLeft: "1.25rem", listStyle: "disc" }}>
                                  {executionBullets.map((b, i) => (
                                    <li key={i}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="trace-actions row gap-xs" style={{ flexWrap: "wrap" }}>
                              <Link href={`/dashboard/plans?case=${riskCaseId}`} className="btn link btn-xs">
                                View risk case
                              </Link>
                              {latestPlanId && (
                                <Link href={`/dashboard/plans?plan=${latestPlanId}`} className="btn link btn-xs">
                                  View plan
                                </Link>
                              )}
                              {riskCase && (
                                <button
                                  type="button"
                                  className="btn secondary btn-xs"
                                  style={{ color: "var(--danger)" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteCaseId(riskCaseId);
                                  }}
                                  disabled={!!deletingCaseId}
                                >
                                  {deletingCaseId === riskCaseId ? "Deleting…" : "Delete case"}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          });
          })()}
        </div>
      )}
    </>
  );
}
