"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentRunningToggle } from "@/components/AgentRunningToggle";
import { AgentSettingsModal } from "@/components/AgentSettingsModal";

export function LogsPageHeaderActions() {
  const searchParams = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (searchParams?.get("settings") === "1") setSettingsOpen(true);
  }, [searchParams]);

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => {
    setSettingsOpen(false);
    if (typeof window !== "undefined" && searchParams?.get("settings") === "1") {
      window.history.replaceState({}, "", "/dashboard/logs");
    }
  };

  return (
    <>
      <div className="row gap-sm" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <AgentRunningToggle compact />
        <button
          type="button"
          onClick={openSettings}
          className="btn secondary btn-sm"
        >
          Agent settings
        </button>
      </div>
      <AgentSettingsModal open={settingsOpen} onClose={closeSettings} />
    </>
  );
}
