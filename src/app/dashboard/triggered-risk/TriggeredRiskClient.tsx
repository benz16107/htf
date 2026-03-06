"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalSignalSection } from "./ExternalSignalSection";
import { InternalSignalSection } from "./InternalSignalSection";
import { RiskAssessmentSection } from "./RiskAssessmentSection";
import { AssessmentOutputsSection } from "./AssessmentOutputsSection";
import { AssessmentArchiveSection } from "./AssessmentArchiveSection";
import { ManualPreventiveCheck } from "./ManualPreventiveCheck";
import type { SelectedSignal, AssessmentOutput, ArchivedOutput } from "./types";

const STORAGE_KEY = "htf-risk-assessment-outputs";
const STORAGE_KEY_ARCHIVE = "htf-risk-assessment-archive";

export function TriggeredRiskClient() {
  const router = useRouter();
  const [selectedSignals, setSelectedSignals] = useState<SelectedSignal[]>([]);
  const [outputs, setOutputs] = useState<AssessmentOutput[]>([]);
  const [archived, setArchived] = useState<ArchivedOutput[]>([]);

  // Restore saved assessment outputs on mount
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOutputs(parsed);
        }
      }
    } catch {
      // ignore invalid or missing storage
    }
  }, []);

  // Restore archive on mount
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY_ARCHIVE) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setArchived(parsed);
        }
      }
    } catch {
      // ignore invalid or missing storage
    }
  }, []);

  // Persist outputs whenever they change (clear storage when empty)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(outputs));
    } catch {
      // ignore quota or other errors
    }
  }, [outputs]);

  // Persist archive whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ARCHIVE, JSON.stringify(archived));
    } catch {
      // ignore quota or other errors
    }
  }, [archived]);

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

  const readdToActive = useCallback((archivedOutput: ArchivedOutput) => {
    const { sentAt: _sentAt, ...output } = archivedOutput;
    setOutputs((prev) => [...prev, output as AssessmentOutput]);
    setArchived((prev) => prev.filter((o) => o.id !== archivedOutput.id));
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
          setArchived((prev) => [...prev, { ...output, sentAt: new Date().toISOString() }]);
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

  return (
    <div className="stack-lg">
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
      <AssessmentArchiveSection archived={archived} onReaddToActive={readdToActive} />
    </div>
  );
}
