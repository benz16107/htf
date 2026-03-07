"use client";

import { useEffect, useRef, useState } from "react";

const RUN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function AgentRunningToggle({ compact }: { compact?: boolean }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/settings/autonomous", { cache: "no-store" });
      const data = await res.json();
      setOn(Boolean(data.config?.agentRunning));
    } catch {
      setOn(false);
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("agent-running-change", { detail: { on: newOn } }));
      }
    } catch {
      // keep current state
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

  if (compact) {
    return (
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <span className="text-sm muted" style={{ margin: 0 }}>Off</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={saving}
          onClick={toggle}
          title={on ? "On — click to turn off" : "Off — click to turn on"}
          className={on ? "agent-toggle--on" : undefined}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: "none",
            background: on ? "var(--accent)" : "var(--muted)",
            cursor: saving ? "not-allowed" : "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s ease",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 22 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "white",
              transition: "left 0.2s ease",
            }}
          />
        </button>
        <span className="text-sm font-medium" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
          On
        </span>
      </div>
    );
  }

  return (
    <div className="row start gap-sm" style={{ alignItems: "center", flexWrap: "wrap" }}>
      <span className="text-sm font-medium" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
        Agent
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={saving}
        onClick={toggle}
        className={on ? "agent-toggle--on" : undefined}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          border: "none",
          background: on ? "var(--success)" : "var(--muted)",
          cursor: saving ? "not-allowed" : "pointer",
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s ease",
        }}
        title={on ? "Running — click to stop" : "Stopped — click to start"}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.2s ease",
          }}
        />
      </button>
      <span className="text-sm muted" style={{ margin: 0, color: on ? "var(--accent-text)" : undefined }}>
        {saving ? "Updating…" : on ? "Running" : "Stopped"}
      </span>
    </div>
  );
}
