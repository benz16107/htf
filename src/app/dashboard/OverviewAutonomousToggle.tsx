"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatedSwitch } from "@/components/AnimatedSwitch";
import { StatusBanner } from "@/components/StatusBanner";

type Props = {
  initialLevel: string;
};

export function OverviewAutonomousToggle({ initialLevel }: Props) {
  const [fullAuto, setFullAuto] = useState(initialLevel === "full_auto");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    variant: "success" | "error";
    title: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    setFullAuto(initialLevel === "full_auto");
  }, [initialLevel]);

  useEffect(() => {
    if (!status || status.variant === "error") return;
    const timeout = window.setTimeout(() => setStatus(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nextLevel = fullAuto ? "off" : "full_auto";
      const res = await fetch("/api/settings/autonomous", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationLevel: nextLevel,
          agentRunning: nextLevel === "full_auto",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setFullAuto(nextLevel === "full_auto");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("autonomous-config-change"));
      }
      setStatus({
        variant: "success",
        title: nextLevel === "full_auto" ? "Full auto enabled" : "Autonomous mode turned off",
        message: nextLevel === "full_auto" ? "The agent can assess, draft, and execute automatically." : "The agent will stop autonomous execution until you turn it back on.",
      });
    } catch {
      setStatus({
        variant: "error",
        title: "Could not update autonomy",
        message: "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="overview-metric"
      data-status={fullAuto ? "pending" : "neutral"}
      style={{ minHeight: "100%", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
    >
      <span className="overview-metric__label">Autonomous agent</span>
      <div className="row" style={{ alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <AnimatedSwitch
          checked={fullAuto}
          disabled={saving}
          onClick={toggle}
          title={fullAuto ? "Full auto - click to turn off" : "Off - click for Full auto"}
          onColor="var(--accent)"
          offColor="var(--surface-container-highest)"
          className={fullAuto ? "agent-toggle--on" : undefined}
        />
        <span
          className="overview-metric__value overview-metric__value--text"
          data-status={fullAuto ? "pending" : "neutral"}
          style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}
        >
          {saving ? "…" : fullAuto ? "Full auto" : "Off"}
        </span>
      </div>
      <span className="overview-metric__note">
        {fullAuto ? "Agent can assess, draft, and execute" : "Turn on for autonomous runs"}
      </span>
      {status ? <StatusBanner compact variant={status.variant} title={status.title} message={status.message} /> : null}
      <Link href="/dashboard/autonomous" className="text-xs link-accent" style={{ marginTop: "auto" }}>
        Settings →
      </Link>
    </div>
  );
}
