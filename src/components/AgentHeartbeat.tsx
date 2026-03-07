"use client";

import { useEffect, useRef } from "react";

const RUN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes — keep in sync with cron

/**
 * When the autonomous agent is on, pings the run endpoint every 2 minutes so the
 * agent keeps processing signals even when the user is on any dashboard page
 * (not only the logs page). In production, Vercel Cron also hits the cron
 * endpoint so the agent runs when no one has the app open.
 */
export function AgentHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);
  const onRef = useRef(false);

  useEffect(() => {
    const fetchConfigAndStart = async () => {
      try {
        const res = await fetch("/api/settings/autonomous", { cache: "no-store" });
        const data = await res.json();
        onRef.current = Boolean(data.config?.agentRunning);
      } catch {
        onRef.current = false;
      }
      if (!onRef.current) return;
      const tick = async () => {
        if (!onRef.current) return;
        const runId = runIdRef.current;
        const body = runId ? { runId } : { continuous: true };
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
    };

    fetchConfigAndStart();

    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<{ on: boolean }>).detail;
      if (detail?.on !== undefined) onRef.current = detail.on;
      if (!detail?.on) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        runIdRef.current = null;
      } else {
        if (!intervalRef.current) fetchConfigAndStart();
      }
    };
    window.addEventListener("agent-running-change", handleChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("agent-running-change", handleChange);
    };
  }, []);

  return null;
}
