"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import AutonomousAgentClient from "@/app/dashboard/autonomous/AutonomousAgentClient";

export function AgentSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="agent-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-settings-title"
    >
      <div className="agent-settings-modal__backdrop" onClick={onClose} aria-hidden />
      <div className="agent-settings-modal__panel">
        <div className="agent-settings-modal__head">
          <h2 id="agent-settings-title" className="agent-settings-modal__title">
            Agent settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn secondary btn-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="agent-settings-modal__body">
          <AutonomousAgentClient />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
