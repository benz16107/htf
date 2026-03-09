"use client";

import { useEffect, useState } from "react";
import { AnimeStagger } from "@/components/AnimeStagger";
import { StatusBanner } from "@/components/StatusBanner";

type Config = {
  id: string | null;
  companyId: string;
  agentRunning?: boolean;
  automationLevel: string;
  signalSources: string;
  internalSignalMode: string;
  internalSignalLookbackMinutes: number;
  externalSignalLookbackMinutes: number;
  minSeverityToAct: string;
  minProbabilityToAct: number;
  minRevenueAtRiskToAct: number | null;
  requireApprovalForSeverity: string | null;
  requireApprovalForRevenueAbove: number | null;
  requireApprovalForProbabilityAbove: number | null;
  maxAutoExecutionsPerDay: number;
  allowedActionTypesToAutoExecute: string[];
  requireApprovalForFirstNPerDay: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type LastRunSnapshot = {
  processed: number;
  created: number;
  executed: number;
  skipReasons?: string[];
  completedAt: string;
};

const LAST_RUN_STORAGE_KEY = "htf-autonomous-last-run";

const AUTOMATION_LEVELS = [
  { value: "off", label: "Off", desc: "No automatic assessment or execution." },
  { value: "assess_only", label: "Assess only", desc: "Run risk assessment on signals only; no risk cases or plans created." },
  { value: "draft_only", label: "Draft only", desc: "Assess, create risk cases, and draft plans; never auto-execute." },
  { value: "full_auto", label: "Full auto", desc: "Assess, draft, and execute when rules allow (subject to approval thresholds)." },
];

const SIGNAL_SOURCES = [
  { value: "internal_only", label: "Internal only", desc: "Only internal signals (e.g. direct Gmail, live inbox events, sheets, CRM, ERP)." },
  { value: "external_only", label: "External only", desc: "Only saved external signals (e.g. news)." },
  { value: "both", label: "Both", desc: "Internal and external signals." },
];

const INTERNAL_SIGNAL_MODES = [
  { value: "lookback", label: "Lookback (poll)", desc: "When the agent runs on a schedule, check recent internal signals gathered by sync or polling." },
  { value: "live", label: "Live", desc: "Start a case as soon as an internal signal is received (e.g. Gmail push or another newly ingested event)." },
];

const SEVERITIES = ["MINOR", "MODERATE", "SEVERE", "CRITICAL"];

const ACTION_TYPES = [
  { value: "zapier_mcp", label: "Zapier / MCP tools" },
  { value: "zapier_action", label: "Zapier action (legacy)" },
  { value: "email", label: "Email" },
  { value: "notification", label: "Notification" },
  { value: "erp_update", label: "ERP update (simulated)" },
];

function Field({
  label,
  hint,
  id,
  children,
}: {
  label: string;
  hint?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id} style={{ color: "var(--muted)", fontSize: "0.8125rem", fontWeight: 500 }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs muted" style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AutonomousAgentClient({
  recentCases: _recentCases,
}: {
  recentCases?: unknown[];
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{
    variant: "info" | "success" | "error";
    title: string;
    message?: string;
  } | null>(null);
  const [lastRun, setLastRun] = useState<LastRunSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/settings/autonomous")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig({
            ...data.config,
            internalSignalMode: data.config.internalSignalMode ?? "lookback",
          });
        }
      })
      .catch(() =>
        setStatus({
          variant: "error",
          title: "Could not load agent settings",
          message: "Refresh the page and try again.",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LAST_RUN_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LastRunSnapshot;
      if (
        parsed &&
        typeof parsed.processed === "number" &&
        typeof parsed.created === "number" &&
        typeof parsed.executed === "number" &&
        typeof parsed.completedAt === "string"
      ) {
        setLastRun(parsed);
      }
    } catch {
      // ignore invalid local cache
    }
  }, []);

  const update = (partial: Partial<Config>) => {
    if (!config) return;
    setConfig({ ...config, ...partial });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setStatus({
      variant: "info",
      title: "Saving settings",
      message: "Updating automation rules, thresholds, and execution limits.",
    });
    try {
      const res = await fetch("/api/settings/autonomous", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentRunning: config.automationLevel !== "off",
          automationLevel: config.automationLevel,
          signalSources: config.signalSources,
          internalSignalMode: config.internalSignalMode,
          internalSignalLookbackMinutes: config.internalSignalLookbackMinutes,
          externalSignalLookbackMinutes: config.externalSignalLookbackMinutes,
          minSeverityToAct: config.minSeverityToAct,
          minProbabilityToAct: config.minProbabilityToAct,
          minRevenueAtRiskToAct: config.minRevenueAtRiskToAct,
          requireApprovalForSeverity: config.requireApprovalForSeverity,
          requireApprovalForRevenueAbove: config.requireApprovalForRevenueAbove,
          requireApprovalForProbabilityAbove: config.requireApprovalForProbabilityAbove,
          maxAutoExecutionsPerDay: config.maxAutoExecutionsPerDay,
          allowedActionTypesToAutoExecute: config.allowedActionTypesToAutoExecute,
          requireApprovalForFirstNPerDay: config.requireApprovalForFirstNPerDay,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (data.config) setConfig(data.config);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("autonomous-config-change"));
      }
      setStatus({
        variant: "success",
        title: "Settings saved",
        message: "Your autonomous agent preferences are now up to date.",
      });
    } catch (e) {
      setStatus({
        variant: "error",
        title: "Save failed",
        message: e instanceof Error ? e.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setStatus({
      variant: "info",
      title: "Running autonomous agent",
      message: "This may take a moment while signals are assessed and actions are prepared.",
    });
    setLastRun(null);
    try {
      const res = await fetch("/api/agents/autonomous/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      const nextRun: LastRunSnapshot = {
        processed: data.processed ?? 0,
        created: data.created ?? 0,
        executed: data.executed ?? 0,
        skipReasons: data.skipReasons,
        completedAt: new Date().toISOString(),
      };
      setLastRun(nextRun);
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(LAST_RUN_STORAGE_KEY, JSON.stringify(nextRun));
        }
      } catch {
        // ignore localStorage failures
      }
      const execText = data.executed === 0 && Array.isArray(data.skipReasons) && data.skipReasons.length > 0
        ? ` Processed ${data.processed ?? 0}, created ${data.created ?? 0}, executed 0. Reasons execution was skipped: ${data.skipReasons.join("; ")}`
        : (data.message || `Processed ${data.processed ?? 0}, created ${data.created ?? 0}, executed ${data.executed ?? 0}.`);
      setStatus({
        variant: "success",
        title: "Run completed",
        message: execText.trim(),
      });
    } catch (e) {
      setStatus({
        variant: "error",
        title: "Run failed",
        message: e instanceof Error ? e.message : "Run failed.",
      });
    } finally {
      setRunning(false);
    }
  };

  const toggleActionType = (value: string) => {
    if (!config) return;
    const arr = config.allowedActionTypesToAutoExecute;
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    update({ allowedActionTypesToAutoExecute: next });
  };

  if (loading || !config) {
    return (
      <div className="card stack">
        <p className="muted">{loading ? "Loading…" : "No config."}</p>
      </div>
    );
  }

  const showInternalSignals = config.signalSources === "internal_only" || config.signalSources === "both";
  const showExternalSignals = config.signalSources === "external_only" || config.signalSources === "both";

  return (
    <AnimeStagger className="stack-xl" itemSelector="[data-animate-section]" delayStep={85}>
      {status ? (
        <div data-animate-section>
          <StatusBanner variant={status.variant} title={status.title} message={status.message} />
        </div>
      ) : null}

      {lastRun && (
        <div className="card stack-sm" data-animate-section>
          <h3 className="text-sm uppercase muted" style={{ margin: 0 }}>Last run</h3>
          <p className="text-sm" style={{ margin: 0 }}>
            Processed <strong>{lastRun.processed}</strong> · Created <strong>{lastRun.created}</strong> risk cases · Auto-executed <strong>{lastRun.executed}</strong> plans
          </p>
          {lastRun.skipReasons && lastRun.skipReasons.length > 0 && (
            <p className="text-xs" style={{ margin: "0.35rem 0 0 0", color: "var(--warning)" }}>
              Execution skip reasons: {lastRun.skipReasons.join("; ")}
            </p>
          )}
          <p className="text-xs muted" style={{ margin: 0 }}>
            Last completed {formatDateTime(lastRun.completedAt)}. Traces appear on the Autonomous Agent page.
          </p>
        </div>
      )}

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>Automation level</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          How much the agent does without human review.
        </p>
        <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
          {AUTOMATION_LEVELS.map((opt) => (
            <label
              key={opt.value}
              className="row start"
              style={{ gap: "0.6rem", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="automationLevel"
                value={opt.value}
                checked={config.automationLevel === opt.value}
                onChange={() => update({ automationLevel: opt.value })}
                style={{ marginTop: "0.2rem" }}
              />
              <div className="stack-xs">
                <span className="font-medium">{opt.label}</span>
                <p className="text-sm muted" style={{ margin: 0 }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>Signal sources</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Which signals to process when the agent runs.
        </p>
        <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
          {SIGNAL_SOURCES.map((opt) => (
            <label
              key={opt.value}
              className="row start"
              style={{ gap: "0.6rem", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="signalSources"
                value={opt.value}
                checked={config.signalSources === opt.value}
                onChange={() => update({ signalSources: opt.value })}
                style={{ marginTop: "0.2rem" }}
              />
              <div className="stack-xs">
                <span className="font-medium">{opt.label}</span>
                <p className="text-sm muted" style={{ margin: 0 }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>Signal retrieval settings</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Configure how the autonomous agent processes internal and external signals. When both are enabled, each source gets its own panel.
        </p>
        <div
          className="stack-sm"
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns:
              showInternalSignals && showExternalSignals
                ? "repeat(2, minmax(0, 1fr))"
                : "minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          {showExternalSignals && (
            <div className="card-flat stack" style={{ padding: "1rem" }}>
              <div className="stack-xs">
                <h3 className="text-sm uppercase muted" style={{ margin: 0 }}>External signals</h3>
                <p className="text-sm muted" style={{ margin: 0 }}>
                  Set how far back the agent should scan saved external signals such as news and market updates.
                </p>
              </div>
              <Field id="external-lookback" label="Lookback window (minutes)" hint="e.g. 10 = last 10 min, 1440 = last 24 hours">
                <input
                  id="external-lookback"
                  type="number"
                  min={1}
                  max={10080}
                  value={config.externalSignalLookbackMinutes}
                  onChange={(e) =>
                    update({
                      externalSignalLookbackMinutes: Math.min(10080, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                  style={{ width: "100%" }}
                />
              </Field>
              <p className="text-xs muted" style={{ margin: 0 }}>
                External signals always use this saved-signal window and are unaffected by the internal live mode setting.
              </p>
            </div>
          )}
          {showInternalSignals && (
            <div className="card-flat stack" style={{ padding: "1rem" }}>
              <div className="stack-xs">
                <h3 className="text-sm uppercase muted" style={{ margin: 0 }}>Internal signals</h3>
                <p className="text-sm muted" style={{ margin: 0 }}>
                  Choose how internal signals are picked up: scheduled lookback for synced or polled sources, or live mode for direct Gmail push and other immediate inbound events.
                </p>
              </div>
              <div className="card-flat stack-xs" style={{ padding: "0.75rem" }}>
                <p className="text-sm font-medium" style={{ margin: 0 }}>Recommended setup</p>
                <p className="muted text-xs" style={{ margin: 0 }}>
                  Configure direct Gmail and Gmail push in Dashboard → Integrations for inbox-style email. Use the Signals & risk internal Configure panel for display filters and scan settings.
                </p>
              </div>
              <div className="stack-sm">
                {INTERNAL_SIGNAL_MODES.map((opt) => (
                  <label
                    key={opt.value}
                    className="row start"
                    style={{ gap: "0.6rem", cursor: "pointer" }}
                  >
                    <input
                      type="radio"
                      name="internalSignalMode"
                      value={opt.value}
                      checked={config.internalSignalMode === opt.value}
                      onChange={() => update({ internalSignalMode: opt.value })}
                      style={{ marginTop: "0.2rem" }}
                    />
                    <div className="stack-xs">
                      <span className="font-medium">{opt.label}</span>
                      <p className="text-sm muted" style={{ margin: 0 }}>{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <Field
                id="internal-lookback"
                label="Lookback window (minutes)"
                hint={config.internalSignalMode === "live" ? "Not used for live Gmail push or other immediate inbound events." : "e.g. 10 = last 10 min, 1440 = last 24 hours"}
              >
                <input
                  id="internal-lookback"
                  type="number"
                  min={1}
                  max={10080}
                  value={config.internalSignalLookbackMinutes}
                  onChange={(e) =>
                    update({
                      internalSignalLookbackMinutes: Math.min(10080, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                  style={{ width: "100%" }}
                  disabled={config.internalSignalMode === "live"}
                />
              </Field>
            </div>
          )}
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>When to act</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Only create risk cases and draft plans when these thresholds are met.
        </p>
        <div className="grid two stack-sm" style={{ marginTop: "1rem" }}>
          <Field id="min-severity" label="Minimum severity">
            <select
              id="min-severity"
              value={config.minSeverityToAct}
              onChange={(e) => update({ minSeverityToAct: e.target.value })}
              style={{ width: "100%" }}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field id="min-probability" label="Minimum probability (%)" hint="Act only when assessed probability is at or above this (0–100).">
            <input
              id="min-probability"
              type="number"
              min={0}
              max={100}
              value={config.minProbabilityToAct}
              onChange={(e) =>
                update({ minProbabilityToAct: Math.min(100, Math.max(0, Number(e.target.value))) })
              }
              style={{ width: "100%" }}
            />
          </Field>
          <Field id="min-revenue" label="Minimum revenue at risk (USD)" hint="Leave empty for no minimum.">
            <input
              id="min-revenue"
              type="number"
              min={0}
              step={1000}
              value={config.minRevenueAtRiskToAct ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({ minRevenueAtRiskToAct: v === "" ? null : Math.max(0, Number(v)) });
              }}
              placeholder="No floor"
              style={{ width: "100%" }}
            />
          </Field>
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>When to require human approval</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          In full auto mode, require approval before executing when any of these apply.
        </p>
        <div className="grid two stack-sm" style={{ marginTop: "1rem" }}>
          <Field id="approval-severity" label="Severity at or above">
            <select
              id="approval-severity"
              value={config.requireApprovalForSeverity ?? ""}
              onChange={(e) => update({ requireApprovalForSeverity: e.target.value || null })}
              style={{ width: "100%" }}
            >
              <option value="">No requirement</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field id="approval-revenue" label="Revenue at risk (USD) above">
            <input
              id="approval-revenue"
              type="number"
              min={0}
              step={1000}
              value={config.requireApprovalForRevenueAbove ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({ requireApprovalForRevenueAbove: v === "" ? null : Math.max(0, Number(v)) });
              }}
              placeholder="No cap"
              style={{ width: "100%" }}
            />
          </Field>
          <Field id="approval-probability" label="Probability (%) above" hint="High-probability cases can be held for review.">
            <input
              id="approval-probability"
              type="number"
              min={0}
              max={100}
              value={config.requireApprovalForProbabilityAbove ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                update({
                  requireApprovalForProbabilityAbove: v === "" ? null : Math.min(100, Math.max(0, Number(v))),
                });
              }}
              placeholder="No cap"
              style={{ width: "100%" }}
            />
          </Field>
          <Field id="approval-first-n" label="First N incidents per day" hint="First N plans each day always need approval (e.g. 1 = first of the day).">
            <input
              id="approval-first-n"
              type="number"
              min={0}
              max={50}
              value={config.requireApprovalForFirstNPerDay}
              onChange={(e) =>
                update({
                  requireApprovalForFirstNPerDay: Math.min(50, Math.max(0, Number(e.target.value) || 0)),
                })
              }
              style={{ width: "100%" }}
            />
          </Field>
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>Execution limits</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Max plans to auto-execute per day (0 = no auto-execution).
        </p>
        <div style={{ marginTop: "0.75rem" }}>
          <Field id="max-auto-exec" label="Max auto-executions per day">
          <input
            id="max-auto-exec"
            type="number"
            min={0}
            max={100}
            value={config.maxAutoExecutionsPerDay}
            onChange={(e) =>
              update({
                maxAutoExecutionsPerDay: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            style={{ width: "100%", maxWidth: 120 }}
          />
        </Field>
        </div>
      </section>

      <section className="card stack" data-animate-section>
        <h2 className="text-lg" style={{ margin: 0 }}>Action types allowed for auto-execute</h2>
        <p className="text-sm muted" style={{ margin: 0 }}>
          Only these action types can run without approval.
        </p>
        <div className="row gap-2xs" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
          {ACTION_TYPES.map((opt) => (
            <label
              key={opt.value}
              className="row gap-2xs"
              style={{ alignItems: "center", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={config.allowedActionTypesToAutoExecute.includes(opt.value)}
                onChange={() => toggleActionType(opt.value)}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="row gap-xs" data-animate-section>
        <button type="button" onClick={save} disabled={saving} className="btn primary">
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running || config.automationLevel === "off"}
          className="btn secondary"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>
    </AnimeStagger>
  );
}
