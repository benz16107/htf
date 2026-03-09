"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatedSwitch } from "@/components/AnimatedSwitch";
import { StatusBanner } from "@/components/StatusBanner";

const RUN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

type AgentConfigSummary = {
  agentRunning: boolean;
  automationLevel: string;
  signalSources: string;
  internalSignalMode: string;
};

function formatAutomationLevel(value: string) {
  switch (value) {
    case "full_auto":
      return "Full auto";
    case "draft_only":
      return "Draft only";
    case "assess_only":
      return "Assess only";
    default:
      return "Off";
  }
}

function formatSignalSources(value: string) {
  switch (value) {
    case "internal_only":
      return "Internal";
    case "external_only":
      return "External";
    default:
      return "Internal + external";
  }
}

function formatInternalSignalMode(value: string) {
  return value === "live" ? "Live" : "Lookback";
}

export function AgentRunningToggle({ compact }: { compact?: boolean }) {
  const [on, setOn] = useState(false);
  const [configSummary, setConfigSummary] = useState<AgentConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    variant: "success" | "error";
    title: string;
    message?: string;
  } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!status || status.variant === "error") return;
    const timeout = window.setTimeout(() => setStatus(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/settings/autonomous", { cache: "no-store" });
      const data = await res.json();
      const nextSummary: AgentConfigSummary = {
        agentRunning: Boolean(data.config?.agentRunning),
        automationLevel: data.config?.automationLevel ?? "off",
        signalSources: data.config?.signalSources ?? "both",
        internalSignalMode: data.config?.internalSignalMode ?? "lookback",
      };
      setOn(nextSummary.agentRunning);
      setConfigSummary(nextSummary);
    } catch {
      setOn(false);
      setConfigSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Refetch when user returns to the tab/page so the toggle always reflects server state
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchConfig();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const handleConfigChange = () => {
      // Any config edit (especially signal source mode) should start a fresh run.
      runIdRef.current = null;
      fetchConfig();
    };
    window.addEventListener("autonomous-config-change", handleConfigChange);
    return () => window.removeEventListener("autonomous-config-change", handleConfigChange);
  }, []);

  useEffect(() => {
    if (!on) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      runIdRef.current = null;
      return;
    }
    const tick = async () => {
      const runId = runIdRef.current;
      const body = runId
        ? { runId }
        : { continuous: true };
      const res = await fetch("/api/agents/autonomous/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        if (data.runId) runIdRef.current = data.runId;
      }
    };
    tick();
    intervalRef.current = setInterval(tick, RUN_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [on]);

  const toggle = async () => {
    if (saving || loading) return;
    setSaving(true);
    try {
      if (on) {
        const runId = runIdRef.current;
        if (runId) {
          await fetch("/api/agents/autonomous/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, stop: true }),
          });
        }
        runIdRef.current = null;
      }
      const res = await fetch("/api/settings/autonomous", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentRunning: !on }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      const newOn = Boolean(data.config?.agentRunning);
      setOn(newOn);
      setConfigSummary({
        agentRunning: newOn,
        automationLevel: data.config?.automationLevel ?? "off",
        signalSources: data.config?.signalSources ?? "both",
        internalSignalMode: data.config?.internalSignalMode ?? "lookback",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("agent-running-change", { detail: { on: newOn } }));
        window.dispatchEvent(new CustomEvent("autonomous-config-change"));
      }
      setStatus({
        variant: "success",
        title: newOn ? "Agent turned on" : "Agent turned off",
        message: newOn ? "Continuous autonomous runs are enabled." : "Continuous autonomous runs are paused.",
      });
    } catch {
      setStatus({
        variant: "error",
        title: "Could not update agent state",
        message: "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <span className="text-sm muted">
        {compact ? "…" : "Loading…"}
      </span>
    );
  }

  const preferenceBadges = configSummary ? [
    { key: "mode", label: "Mode", value: formatAutomationLevel(configSummary.automationLevel) },
    { key: "signals", label: "Signals", value: formatSignalSources(configSummary.signalSources) },
    ...(configSummary.signalSources !== "external_only"
      ? [{ key: "internal", label: "Internal", value: formatInternalSignalMode(configSummary.internalSignalMode) }]
      : []),
  ] : [];

  if (compact) {
    return (
      <div className="stack-xs">
        <div className="row" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
            <span className="text-sm muted" style={{ margin: 0 }}>Off</span>
            <AnimatedSwitch
              checked={on}
              disabled={saving}
              onClick={toggle}
              title={on ? "On - click to turn off" : "Off - click to turn on"}
              width={44}
              height={24}
              onColor="var(--accent)"
              offColor="var(--muted)"
              className={on ? "agent-toggle--on" : undefined}
            />
            <span className="text-sm font-medium" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
              On
            </span>
          </div>
          {preferenceBadges.length > 0 ? (
            <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
              {preferenceBadges.map((item) => (
                <span
                  key={item.key}
                  className={`badge ${item.key === "mode" ? "accent" : ""}`.trim()}
                  title={`${item.label}: ${item.value}`}
                >
                  {item.label}: {item.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {status ? <StatusBanner compact variant={status.variant} title={status.title} message={status.message} /> : null}
      </div>
    );
  }

  return (
    <div className="stack-xs">
      <div className="row start gap-sm" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <span className="text-sm font-medium" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
          Agent
        </span>
        <AnimatedSwitch
          checked={on}
          disabled={saving}
          onClick={toggle}
          title={on ? "Running - click to stop" : "Stopped - click to start"}
          width={44}
          height={24}
          onColor="var(--success)"
          offColor="var(--muted)"
          className={on ? "agent-toggle--on" : undefined}
        />
        <span className="text-sm muted" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
          {saving ? "Updating…" : on ? "Running" : "Stopped"}
        </span>
      </div>
      {preferenceBadges.length > 0 ? (
        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
          {preferenceBadges.map((item) => (
            <span
              key={item.key}
              className={`badge ${item.key === "mode" ? "accent" : ""}`.trim()}
              title={`${item.label}: ${item.value}`}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : null}
      {status ? <StatusBanner compact variant={status.variant} title={status.title} message={status.message} /> : null}
    </div>
  );
}
