"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  initialLevel: string;
};

export function OverviewAutonomousToggle({ initialLevel }: Props) {
  const [fullAuto, setFullAuto] = useState(initialLevel === "full_auto");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFullAuto(initialLevel === "full_auto");
  }, [initialLevel]);

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
    } catch {
      // keep current state
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
        <button
          type="button"
          role="switch"
          aria-checked={fullAuto}
          disabled={saving}
          onClick={toggle}
          title={fullAuto ? "Full auto — click to turn off" : "Off — click for Full auto"}
          style={{
            width: 56,
            height: 30,
            borderRadius: 15,
            border: "2px solid var(--border)",
            background: fullAuto ? "var(--accent)" : "var(--surface-soft)",
            cursor: saving ? "not-allowed" : "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: fullAuto ? 26 : 2,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "white",
              boxShadow: "var(--shadow-sm)",
              transition: "left 0.2s ease",
            }}
          />
        </button>
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
      <Link href="/dashboard/autonomous" className="text-xs link-accent" style={{ marginTop: "auto" }}>
        Settings →
      </Link>
    </div>
  );
}
