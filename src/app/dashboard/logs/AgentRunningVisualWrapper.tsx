"use client";

import { useEffect, useState, useRef } from "react";

const EVENT_NAME = "agent-running-change";

export function AgentRunningVisualWrapper({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const [playTurnOnAnimation, setPlayTurnOnAnimation] = useState(false);
  const prevOn = useRef(false);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch("/api/settings/autonomous");
        const data = await res.json();
        setOn(Boolean(data.config?.agentRunning));
      } catch {
        setOn(false);
      }
    };
    fetchState();
  }, []);

  useEffect(() => {
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<{ on: boolean }>).detail;
      if (detail?.on !== undefined) {
        setOn(detail.on);
        if (detail.on) setPlayTurnOnAnimation(true);
      }
    };
    window.addEventListener(EVENT_NAME, handleChange);
    return () => window.removeEventListener(EVENT_NAME, handleChange);
  }, []);

  useEffect(() => {
    if (on && prevOn.current === false) {
      setPlayTurnOnAnimation(true);
    }
    prevOn.current = on;
  }, [on]);

  useEffect(() => {
    if (!playTurnOnAnimation) return;
    const t = setTimeout(() => setPlayTurnOnAnimation(false), 1400);
    return () => clearTimeout(t);
  }, [playTurnOnAnimation]);

  return (
    <div
      className={`agent-running-wrapper ${on ? "agent-on" : ""} ${playTurnOnAnimation ? "agent-turn-on-animation" : ""}`}
      data-agent-running={on}
    >
      {children}
    </div>
  );
}
