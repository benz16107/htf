"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimeStagger } from "@/components/AnimeStagger";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MitigationCard } from "@/components/MitigationCard";

type RiskCase = {
  id: string;
  scenarios?: unknown[];
  mitigationPlans?: { status: string }[];
  [key: string]: unknown;
};

type MitigationPlansClientProps = {
  activeCases: RiskCase[];
  archivedCases: RiskCase[];
};

export default function MitigationPlansClient({
  activeCases,
  archivedCases,
}: MitigationPlansClientProps) {
  const router = useRouter();
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const allCases = useMemo(
    () => [...activeCases, ...archivedCases].filter((riskCase) => typeof riskCase.id === "string" && riskCase.id.length > 0),
    [activeCases, archivedCases]
  );
  const allCaseIds = useMemo(() => allCases.map((riskCase) => riskCase.id), [allCases]);
  const selectedCount = selectedCaseIds.size;

  useEffect(() => {
    const validIds = new Set(allCaseIds);
    setSelectedCaseIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allCaseIds]);

  const setSelected = (riskCaseId: string, checked: boolean) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(riskCaseId);
      else next.delete(riskCaseId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCaseIds(new Set(allCaseIds));
  };

  const clearSelection = () => {
    setSelectedCaseIds(new Set());
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedCaseIds);
    if (ids.length === 0) return;

    try {
      setBulkDeleting(true);
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/risk/cases/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Failed to delete mitigation plan");
          }
        })
      );

      const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed.length > 0) {
        const firstError = failed[0]?.reason;
        const message = firstError instanceof Error ? firstError.message : "Failed to delete one or more selected mitigation plans";
        router.refresh();
        alert(message);
        return;
      }

      setConfirmBulkDeleteOpen(false);
      clearSelection();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete selected mitigation plans");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <ConfirmModal
        open={confirmBulkDeleteOpen}
        title="Delete selected mitigation plans"
        message={`Delete ${selectedCount} selected mitigation ${selectedCount === 1 ? "plan" : "plans"}? This cannot be undone.`}
        confirmLabel={selectedCount === 1 ? "Delete selected plan" : `Delete ${selectedCount} selected`}
        cancelLabel="Cancel"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setConfirmBulkDeleteOpen(false)}
      />

      {allCases.length > 0 && (
        <section className="card-flat row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <p className="text-sm muted" style={{ margin: 0 }}>
            {selectedCount > 0
              ? `${selectedCount} mitigation ${selectedCount === 1 ? "plan" : "plans"} selected`
              : "Select mitigation plans to delete them in bulk."}
          </p>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn secondary btn-sm" onClick={selectAll} disabled={allCaseIds.length === 0 || bulkDeleting}>
              Select all
            </button>
            <button type="button" className="btn secondary btn-sm" onClick={clearSelection} disabled={selectedCount === 0 || bulkDeleting}>
              Clear
            </button>
            <button
              type="button"
              className="btn danger btn-sm"
              onClick={() => setConfirmBulkDeleteOpen(true)}
              disabled={selectedCount === 0 || bulkDeleting}
            >
              {bulkDeleting ? "Deleting…" : selectedCount <= 0 ? "Delete selected" : `Delete selected (${selectedCount})`}
            </button>
          </div>
        </section>
      )}

      {activeCases.length === 0 ? (
        <section className="card empty-state">
          <h3>No current cases</h3>
          <p>Disruption cases will appear here for approval.</p>
          <Link href="/dashboard/triggered-risk" className="btn primary" style={{ marginTop: "1.5rem" }}>
            Signals & risk
          </Link>
        </section>
      ) : (
        <div className="stack-lg">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h3 className="text-lg font-semibold" style={{ margin: 0 }}>Current cases</h3>
            <p className="text-xs muted" style={{ margin: 0 }}>
              {activeCases.filter((riskCase) => selectedCaseIds.has(riskCase.id)).length} selected
            </p>
          </div>
          <AnimeStagger className="stack-md" style={{ marginTop: "0.75rem" }} delayStep={0} duration={220} translateY={8} scale={0.995}>
            {activeCases.map((riskCase, index) => (
              <MitigationCard
                key={riskCase.id}
                riskCase={riskCase}
                defaultExpanded={index === 0}
                selectable
                selected={selectedCaseIds.has(riskCase.id)}
                onSelectedChange={(checked) => setSelected(riskCase.id, checked)}
              />
            ))}
          </AnimeStagger>
        </div>
      )}

      <div className="stack-lg" style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h3 className="text-lg font-semibold muted" style={{ margin: 0 }}>Archive</h3>
          <p className="text-xs muted" style={{ margin: 0 }}>
            {archivedCases.filter((riskCase) => selectedCaseIds.has(riskCase.id)).length} selected
          </p>
        </div>
        <AnimeStagger className="stack-md" style={{ marginTop: "0.75rem" }} delayStep={0} duration={220} translateY={8} scale={0.995}>
          {archivedCases.length === 0 ? (
            <p className="muted text-sm" style={{ margin: 0 }}>No archived cases yet.</p>
          ) : (
            archivedCases.map((riskCase) => (
              <MitigationCard
                key={riskCase.id}
                riskCase={riskCase}
                archived
                selectable
                selected={selectedCaseIds.has(riskCase.id)}
                onSelectedChange={(checked) => setSelected(riskCase.id, checked)}
              />
            ))
          )}
        </AnimeStagger>
      </div>
    </>
  );
}
