"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ExternalSignalSection } from "./ExternalSignalSection";
import { InternalSignalSection } from "./InternalSignalSection";
import { RiskAssessmentSection } from "./RiskAssessmentSection";
import { AssessmentOutputsSection } from "./AssessmentOutputsSection";
import { AssessmentArchiveSection } from "./AssessmentArchiveSection";
import { ManualPreventiveCheck } from "./ManualPreventiveCheck";
import type { SelectedSignal, AssessmentOutput, ArchivedOutput } from "./types";

type ArchiveConfirmState = null | "clear-all" | { type: "delete-item"; id: string };

const STORAGE_KEY = "htf-risk-assessment-outputs";
const SELECTED_SIGNALS_KEY = "htf-risk-selected-signals";

export function TriggeredRiskClient() {
  const router = useRouter();
  const [selectedSignals, setSelectedSignals] = useState<SelectedSignal[]>([]);
  const [outputs, setOutputs] = useState<AssessmentOutput[]>([]);
  const [archived, setArchived] = useState<ArchivedOutput[]>([]);
  const [archiveConfirm, setArchiveConfirm] = useState<ArchiveConfirmState>(null);

  // Restore saved assessment outputs and selected signals on mount
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOutputs(parsed);
        }
      }
      const signalsRaw = typeof localStorage !== "undefined" ? localStorage.getItem(SELECTED_SIGNALS_KEY) : null;
      if (signalsRaw) {
        const signalsParsed = JSON.parse(signalsRaw);
        if (Array.isArray(signalsParsed) && signalsParsed.length > 0) {
          setSelectedSignals(signalsParsed);
        }
      }
    } catch {
      // ignore invalid or missing storage
    }
  }, []);

  // Persist selected signals whenever they change
  useEffect(() => {
    try {
      if (selectedSignals.length > 0) {
        localStorage.setItem(SELECTED_SIGNALS_KEY, JSON.stringify(selectedSignals));
      } else {
        localStorage.removeItem(SELECTED_SIGNALS_KEY);
      }
    } catch {
      // ignore quota or other errors
    }
  }, [selectedSignals]);

  // Load archive from API on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/risk/archive");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const list = Array.isArray(data?.archived) ? data.archived : [];
        if (!cancelled) {
          setArchived(
            list.map((a: { id: string; triggerType: string; issueTitle?: string; entityMap?: Record<string, string>; timeWindow?: object; assumptions?: string[]; assessment?: object; sentAt: string; source?: "manual" | "autonomous" }) => ({
              id: a.id,
              triggerType: a.triggerType,
              issueTitle: a.issueTitle,
              entityMap: a.entityMap ?? {},
              timeWindow: a.timeWindow ?? {},
              assumptions: a.assumptions ?? [],
              assessment: a.assessment ?? {},
              sentAt: a.sentAt,
              source: a.source,
            }))
          );
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist outputs whenever they change (clear storage when empty)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(outputs));
    } catch {
      // ignore quota or other errors
    }
  }, [outputs]);

  const addToAssessment = useCallback((item: SelectedSignal) => {
    setSelectedSignals((prev) => {
      if (prev.some((s) => s.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeFromAssessment = useCallback((id: string) => {
    setSelectedSignals((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addOutput = useCallback((output: AssessmentOutput) => {
    setOutputs((prev) => [...prev, output]);
  }, []);

  const removeOutput = useCallback((id: string) => {
    setOutputs((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const doClearArchive = useCallback(async () => {
    try {
      await fetch("/api/risk/archive", { method: "DELETE" });
      setArchived([]);
    } catch {
      setArchived([]);
    }
  }, []);

  const doDeleteArchivedItem = useCallback(async (id: string) => {
    try {
      await fetch(`/api/risk/archive/${id}`, { method: "DELETE" });
      setArchived((prev) => prev.filter((o) => o.id !== id));
    } catch {
      setArchived((prev) => prev.filter((o) => o.id !== id));
    }
  }, []);

  const clearArchive = useCallback(() => setArchiveConfirm("clear-all"), []);
  const deleteArchivedItem = useCallback((id: string) => setArchiveConfirm({ type: "delete-item", id }), []);

  const onArchiveConfirmConfirm = useCallback(async () => {
    if (archiveConfirm === "clear-all") {
      await doClearArchive();
      setArchiveConfirm(null);
    } else if (archiveConfirm && archiveConfirm.type === "delete-item") {
      await doDeleteArchivedItem(archiveConfirm.id);
      setArchiveConfirm(null);
    }
  }, [archiveConfirm, doClearArchive, doDeleteArchivedItem]);

  const readdToActive = useCallback(async (archivedOutput: ArchivedOutput) => {
    const { sentAt: _sentAt, source: _src, ...output } = archivedOutput;
    try {
      await fetch(`/api/risk/archive/${archivedOutput.id}`, { method: "DELETE" });
      setArchived((prev) => prev.filter((o) => o.id !== archivedOutput.id));
      setOutputs((prev) => [...prev, output as AssessmentOutput]);
    } catch {
      setArchived((prev) => prev.filter((o) => o.id !== archivedOutput.id));
      setOutputs((prev) => [...prev, output as AssessmentOutput]);
    }
  }, []);

  const sendToMitigation = useCallback(
    async (output: AssessmentOutput) => {
      try {
        const res = await fetch("/api/risk/create-from-assessment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triggerType: output.triggerType,
            issueTitle: output.issueTitle,
            entityMap: output.entityMap,
            timeWindow: output.timeWindow,
            assumptions: output.assumptions,
            riskAssessment: output.assessment,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          // Add to archive via API so it appears in Signals archive (manual source)
          try {
            const archiveRes = await fetch("/api/risk/archive", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                triggerType: output.triggerType,
                issueTitle: output.issueTitle,
                entityMap: output.entityMap,
                timeWindow: output.timeWindow,
                assumptions: output.assumptions,
                assessment: output.assessment,
              }),
            });
            const archiveData = await archiveRes.json().catch(() => ({}));
            if (archiveRes.ok && archiveData.id != null) {
              setArchived((prev) => [
                ...prev,
                {
                  ...output,
                  id: String(archiveData.id),
                  sentAt: archiveData.sentAt ?? new Date().toISOString(),
                  source: "manual",
                },
              ]);
            }
          } catch {
            // archive failure doesn't block redirect
          }
          setOutputs((prev) => prev.filter((o) => o.id !== output.id));
          router.push("/dashboard/plans");
          router.refresh();
        } else {
          alert(data.error || "Failed to create mitigation.");
        }
      } catch {
        alert("Network error.");
      }
    },
    [router]
  );

  const archiveConfirmOpen = archiveConfirm !== null;
  const archiveConfirmTitle =
    archiveConfirm === "clear-all"
      ? "Delete archive"
      : archiveConfirm?.type === "delete-item"
        ? "Remove from archive"
        : "";
  const archiveConfirmMessage =
    archiveConfirm === "clear-all"
      ? "Remove all items from the archive? This cannot be undone."
      : archiveConfirm?.type === "delete-item"
        ? "Remove this item from the archive?"
        : "";

  return (
    <div className="stack-lg">
      <ConfirmModal
        open={archiveConfirmOpen}
        title={archiveConfirmTitle}
        message={archiveConfirmMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={onArchiveConfirmConfirm}
        onCancel={() => setArchiveConfirm(null)}
      />
      <div className="risk-signals-and-assessment">
        <div className="stack-lg">
          <ExternalSignalSection onAddToAssessment={addToAssessment} />
          <InternalSignalSection onAddToAssessment={addToAssessment} />
        </div>
        <RiskAssessmentSection
          selectedSignals={selectedSignals}
          onRemoveSignal={removeFromAssessment}
          onOutput={addOutput}
        />
      </div>
      <AssessmentOutputsSection
        outputs={outputs}
        onSendToMitigation={sendToMitigation}
        onRemoveOutput={removeOutput}
      />
      <ManualPreventiveCheck onAddToAssessment={addToAssessment} />
      <AssessmentArchiveSection
        archived={archived}
        onReaddToActive={readdToActive}
        onClearArchive={clearArchive}
        onDeleteItem={deleteArchivedItem}
      />
    </div>
  );
}
