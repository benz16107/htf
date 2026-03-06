"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Probability may be stored as 0–1 or 0–100; return 0–100 for display */
function probabilityToPercent(n: number): number {
  if (n > 1) return Math.min(100, Math.max(0, n));
  return Math.min(100, Math.max(0, n * 100));
}

type MitigationCardProps = { riskCase: any; archived?: boolean; /** For active cards: only first should be true so first is expanded by default */ defaultExpanded?: boolean };

export function MitigationCard({ riskCase: rc, archived = false, defaultExpanded = true }: MitigationCardProps) {
  const router = useRouter();
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(defaultExpanded);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draftedPlan, setDraftedPlan] = useState<any | null>(rc.mitigationPlans?.[0] || null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [deletingCase, setDeletingCase] = useState(false);
  const [cloningPlan, setCloningPlan] = useState(false);
  const [selectedActionIndices, setSelectedActionIndices] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ stepTitle: string; recipientOrEndpoint: string; payloadOrBody: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const actions = Array.isArray(draftedPlan?.actions) ? draftedPlan.actions : [];

  useEffect(() => {
    if (actions.length > 0 && draftedPlan?.status !== "EXECUTED") {
      setSelectedActionIndices((prev) => {
        if (prev.size === 0) return new Set(actions.map((_: unknown, i: number) => i));
        const next = new Set<number>();
        for (let i = 0; i < actions.length; i++) {
          if (prev.has(i)) next.add(i);
        }
        return next.size > 0 ? next : new Set(actions.map((_: unknown, i: number) => i));
      });
    }
  }, [draftedPlan?.id, actions.length]);

  const handleExecute = async (scenarioId: string) => {
    try {
      setLoadingId(scenarioId);
      const res = await fetch("/api/agents/mitigation-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskCaseId: rc.id, scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        setDraftedPlan(data.plan);
        setSelectedActionIndices(new Set((data.plan?.actions ?? []).map((_: unknown, i: number) => i)));
      } else alert(data.error);
    } catch { alert("Failed to draft plan"); } finally { setLoadingId(null); }
  };

  const handleApprove = async () => {
    if (!draftedPlan?.id) return;
    const indices = selectedActionIndices.size > 0
      ? Array.from(selectedActionIndices)
      : actions.map((_: unknown, i: number) => i);
    try {
      setIsExecuting(true);
      const res = await fetch("/api/agents/mitigation-action/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: draftedPlan.id,
          actionIndices: indices,
          actions: draftedPlan.actions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const hadFailures = data.executionResults?.failed?.length > 0;
        if (!hadFailures) {
          setDraftedPlan({ ...draftedPlan, status: "EXECUTED" });
          router.refresh();
        } else {
          const lines = data.executionResults.failed.map(
            (f: { stepTitle?: string; error: string }) => `${f.stepTitle ?? "Action"}: ${f.error}`
          );
          alert("Some actions failed. Plan stayed in draft.\n\n" + lines.join("\n\n"));
        }
      } else alert(data.error || "Execution failed");
    } catch { alert("Failed to execute plan"); } finally { setIsExecuting(false); }
  };

  const handleDeleteDraft = async () => {
    if (!draftedPlan?.id || draftedPlan?.status === "EXECUTED") return;
    try {
      setDeletingDraft(true);
      const res = await fetch(`/api/mitigation-plans/${draftedPlan.id}`, { method: "DELETE" });
      if (res.ok) {
        setDraftedPlan(null);
        setSelectedActionIndices(new Set());
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete draft");
      }
    } catch { alert("Failed to delete draft"); } finally { setDeletingDraft(false); }
  };

  const handleDeleteCase = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rc.id || deletingCase) return;
    if (!confirm("Remove this mitigation plan? This cannot be undone.")) return;
    try {
      setDeletingCase(true);
      const res = await fetch(`/api/risk/cases/${rc.id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete mitigation plan");
      }
    } catch {
      alert("Failed to delete mitigation plan");
    } finally {
      setDeletingCase(false);
    }
  };

  const toggleAction = (idx: number) => {
    setSelectedActionIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const startEdit = (idx: number) => {
    const action = actions[idx];
    if (!action) return;
    setEditingIdx(idx);
    setEditForm({
      stepTitle: action.stepTitle ?? "",
      recipientOrEndpoint: action.recipientOrEndpoint ?? "",
      payloadOrBody: action.payloadOrBody ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditForm(null);
  };

  const handleReaddAsNew = async () => {
    const plan = rc.mitigationPlans?.[0];
    if (!plan?.id || plan.status !== "EXECUTED") return;
    try {
      setCloningPlan(true);
      const res = await fetch("/api/mitigation-plans/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePlanId: plan.id }),
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else alert(data.error || "Failed to readd plan");
    } catch {
      alert("Failed to readd plan");
    } finally {
      setCloningPlan(false);
    }
  };

  const saveEdit = async () => {
    if (editingIdx == null || !editForm || !draftedPlan?.id) return;
    const updatedActions = [...actions];
    const existing = updatedActions[editingIdx] as any;
    updatedActions[editingIdx] = {
      ...existing,
      stepTitle: editForm.stepTitle || undefined,
      recipientOrEndpoint: editForm.recipientOrEndpoint,
      payloadOrBody: editForm.payloadOrBody,
    };
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/mitigation-plans/${draftedPlan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: updatedActions }),
      });
      const data = await res.json();
      if (data.success) {
        setDraftedPlan({ ...draftedPlan, actions: data.plan?.actions ?? updatedActions });
        setEditingIdx(null);
        setEditForm(null);
      } else alert(data.error || "Failed to save");
    } catch { alert("Failed to save draft"); } finally { setSavingEdit(false); }
  };

  const isExecuted = draftedPlan?.status === "EXECUTED";

  const isSuggestionType = (type: string) => type === "insight" || type === "recommendation";
  const totalExecutable = actions.filter((a: any) => !isSuggestionType(a?.type)).length;
  const executableCount = actions.filter((a: any, i: number) => selectedActionIndices.has(i) && !isSuggestionType(a?.type)).length;
  const selectedCount = selectedActionIndices.size;

  return (
    <section className="card stack-lg" style={{ opacity: isExecuted ? 0.75 : 1 }}>
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          borderBottom: (archived && !archivedExpanded) || (!archived && !activeExpanded) ? "none" : "1px solid var(--border)",
          paddingBottom: "1rem",
          cursor: "pointer",
          alignItems: "center",
        }}
        onClick={archived ? () => setArchivedExpanded((e) => !e) : () => setActiveExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && (archived ? setArchivedExpanded((e) => !e) : setActiveExpanded((e) => !e))}
        aria-expanded={archived ? archivedExpanded : activeExpanded}
      >
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
          <span className="muted" style={{ fontSize: "0.875rem", transform: (archived ? archivedExpanded : activeExpanded) ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} aria-hidden>
            &gt;
          </span>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.4rem", textDecoration: isExecuted ? "line-through" : "none", margin: 0 }}>
              <span className="dot danger" />
              {rc.triggerType?.toUpperCase?.() ?? "Risk"}
            </h3>
            <p className="muted text-sm" style={{ marginTop: "0.2rem" }}>
              Confidence: <strong style={{ color: "var(--foreground)" }}>{rc.confidenceLevel || "N/A"}</strong> · Financial Risk:{" "}
              <strong style={{ color: "var(--foreground)" }}>${(rc.financialImpact as any)?.revenueAtRiskUsd?.toLocaleString() || "N/A"}</strong>
            </p>
          </div>
        </div>
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {archived && (
            <button
              type="button"
              className="btn primary btn-sm"
              onClick={handleReaddAsNew}
              disabled={cloningPlan}
              aria-label="Readd as new mitigation plan"
            >
              {cloningPlan ? "Readding…" : "Readd as new"}
            </button>
          )}
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={handleDeleteCase}
            disabled={deletingCase}
            aria-label="Delete mitigation plan"
          >
            {deletingCase ? "Deleting…" : "Delete"}
          </button>
          <span className={`badge ${isExecuted ? "success" : draftedPlan ? "accent" : ""}`}>
            {isExecuted ? "Mitigated" : draftedPlan ? "Approval Pending" : "Needs Action"}
          </span>
        </div>
      </div>

      {((archived && archivedExpanded) || (!archived && activeExpanded)) && (
        <>
      {/* Assessed risk: description from signals (what's going on) */}
      {rc.entityMap && typeof rc.entityMap === "object" && (() => {
        const em = rc.entityMap as Record<string, unknown>;
        const trunc = (s: string, max = 120) => (s.length <= max ? s : s.slice(0, max).trim() + "…");
        const lines: string[] = [];
        const internalList = Array.isArray(em.internalSignals) ? em.internalSignals : [];
        const externalList = Array.isArray(em.externalSignals) ? em.externalSignals : [];
        const manualList = Array.isArray(em.manualScenarios) ? em.manualScenarios : [];
        internalList.forEach((item: any) => {
          const text = item?.signal ?? item?.summary ?? "";
          const src = item?.source ?? "internal";
          if (text) lines.push(`Internal (${src}): ${trunc(String(text))}`);
        });
        externalList.forEach((item: any) => {
          const text = item?.title ?? item?.snippet ?? "";
          if (text) lines.push(`External: ${trunc(String(text))}`);
        });
        manualList.forEach((item: any) => {
          const text = item?.scenario ?? item?.summary ?? "";
          if (text) lines.push(`Manual: ${trunc(String(text))}`);
        });
        if (lines.length === 0) return null;
        return (
          <div className="card-flat stack-sm" style={{ padding: "0.75rem 1rem" }}>
            <h4 className="text-sm font-semibold" style={{ margin: "0 0 0.5rem 0" }}>Assessed risk</h4>
            <p className="text-xs muted" style={{ margin: 0 }}>Signals that drove this assessment (from Signals &amp; Risk/Impact Analysis):</p>
            <ul className="text-sm" style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.25rem", listStyle: "disc" }}>
              {lines.map((line, i) => (
                <li key={i} style={{ marginBottom: "0.25rem" }}>{line}</li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Risk assessment details */}
      <div className="card-flat stack-sm" style={{ padding: "0.75rem 1rem" }}>
        <h4 className="text-sm font-semibold" style={{ margin: "0 0 0.5rem 0" }}>Risk assessment details</h4>
        <div className="row" style={{ flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
          {rc.severity && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Severity</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>{String(rc.severity)}</p>
            </div>
          )}
          {(rc.probabilityPoint != null || rc.probabilityBandLow != null) && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Probability</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                {rc.probabilityPoint != null
                  ? `${probabilityToPercent(rc.probabilityPoint).toFixed(0)}%`
                  : rc.probabilityBandLow != null && rc.probabilityBandHigh != null
                    ? `${probabilityToPercent(rc.probabilityBandLow as number).toFixed(0)}–${probabilityToPercent(rc.probabilityBandHigh as number).toFixed(0)}%`
                    : "—"}
              </p>
            </div>
          )}
          {rc.confidenceLevel && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Confidence</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>{String(rc.confidenceLevel)}</p>
            </div>
          )}
          {rc.financialImpact && typeof rc.financialImpact === "object" && ((rc.financialImpact as any).revenueAtRiskUsd != null || (rc.financialImpact as any).marginErosionPercent != null) && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Financial impact</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                {(rc.financialImpact as any).revenueAtRiskUsd != null && `$${Number((rc.financialImpact as any).revenueAtRiskUsd).toLocaleString()} at risk`}
                {(rc.financialImpact as any).revenueAtRiskUsd != null && (rc.financialImpact as any).marginErosionPercent != null && " · "}
                {(rc.financialImpact as any).marginErosionPercent != null && `${(rc.financialImpact as any).marginErosionPercent}% margin erosion`}
              </p>
            </div>
          )}
          {rc.timeWindow && typeof rc.timeWindow === "object" && ((rc.timeWindow as any).startDate || (rc.timeWindow as any).expectedDurationDays != null) && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Time window</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                {(rc.timeWindow as any).startDate && `${String((rc.timeWindow as any).startDate)}`}
                {(rc.timeWindow as any).expectedDurationDays != null && ` · ${(rc.timeWindow as any).expectedDurationDays} days`}
              </p>
            </div>
          )}
          {rc.serviceImpact && typeof rc.serviceImpact === "object" && ((rc.serviceImpact as any).severity || (rc.serviceImpact as any).timelineWeeks != null) && (
            <div>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Impact</p>
              <p className="text-sm font-medium" style={{ margin: "0.2rem 0 0 0" }}>
                {(rc.serviceImpact as any).severity && String((rc.serviceImpact as any).severity)}
                {(rc.serviceImpact as any).timelineWeeks != null && ` · ${(rc.serviceImpact as any).timelineWeeks} wk`}
              </p>
            </div>
          )}
        </div>
        {Array.isArray(rc.keyDrivers) && rc.keyDrivers.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <p className="text-xs uppercase muted" style={{ margin: "0 0 0.35rem 0" }}>Key drivers</p>
            <ul className="text-sm" style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "disc" }}>
              {(rc.keyDrivers as string[]).map((driver: string, i: number) => (
                <li key={i} style={{ marginBottom: "0.2rem" }}>{typeof driver === "string" ? driver : String(driver)}</li>
              ))}
            </ul>
          </div>
        )}
        {rc.entityMap && typeof rc.entityMap === "object" && (
          (() => {
            const em = rc.entityMap as Record<string, unknown>;
            const parts = [];
            if (em.internalSignalsCount != null) parts.push(`${em.internalSignalsCount} internal`);
            if (em.externalSignalsCount != null) parts.push(`${em.externalSignalsCount} external`);
            if (em.manualScenariosCount != null && Number(em.manualScenariosCount) > 0) parts.push(`${em.manualScenariosCount} manual`);
            if (parts.length > 0) {
              return (
                <p className="text-xs muted" style={{ margin: "0.5rem 0 0 0" }}>
                  Signals: {parts.join(", ")}
                </p>
              );
            }
            return null;
          })()
        )}
        {Array.isArray(rc.assumptions) && rc.assumptions.length > 0 && (
          <p className="text-xs muted" style={{ margin: "0.5rem 0 0 0" }}>
            Assumptions: {(rc.assumptions as string[]).join("; ")}
          </p>
        )}
      </div>

      {/* Trade-off Scenarios */}
      {!isExecuted && (
        <div className="stack">
          <h4>Trade-off Scenarios</h4>
          <div className="scenario-cards-grid">
            {rc.scenarios?.map((s: any) => {
              const rec = s.recommendation === "RECOMMENDED";
              const assumptions = s.assumptions;
              const assumptionList = Array.isArray(assumptions) ? assumptions : typeof assumptions === "string" ? [assumptions] : [];
              return (
                <div key={s.id} className={`scenario-card${rec ? " recommended" : ""}`}>
                  {rec && <span className="badge accent" style={{ alignSelf: "flex-start" }}>AI Pick</span>}
                  <h4>{s.name}</h4>
                  {Array.isArray(s.planOutline) && s.planOutline.length > 0 && (
                    <div className="stack-xs" style={{ marginBottom: "0.25rem" }}>
                      <p className="text-xs uppercase muted" style={{ margin: 0 }}>Tasks to be drafted</p>
                      <ul className="text-xs" style={{ margin: 0, paddingLeft: "1rem", listStyle: "disc" }}>
                        {s.planOutline.map((item: any, i: number) => {
                          const task = typeof item === "object" && item != null && "task" in item ? String(item.task) : String(item);
                          const execType = typeof item === "object" && item != null && "executionType" in item ? String(item.executionType) : null;
                          const label = execType ? `${execType.replace(/_/g, " ")}: ${task}` : task;
                          return <li key={i}>{label}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="stack-sm" style={{ gap: "0.5rem" }}>
                    <div className="grid two" style={{ gap: "0.4rem" }}>
                      <div className="card-flat">
                        <p className="text-xs uppercase muted">Cost Delta</p>
                        <p className="text-sm font-semibold" style={{ color: s.costDelta != null && s.costDelta > 1 ? "var(--danger)" : "var(--success)" }}>
                          {s.costDelta != null ? `${(s.costDelta * 100 - 100).toFixed(1)}%` : "N/A"}
                        </p>
                      </div>
                      <div className="card-flat">
                        <p className="text-xs uppercase muted">Service</p>
                        <p className="text-sm font-semibold" style={{ color: s.serviceImpact != null && s.serviceImpact < 0 ? "var(--danger)" : "var(--success)" }}>
                          {s.serviceImpact != null ? `${(s.serviceImpact * 100).toFixed(1)}%` : "N/A"}
                        </p>
                      </div>
                      <div className="card-flat">
                        <p className="text-xs uppercase muted">Risk Reduction</p>
                        <p className="text-sm font-semibold">
                          {s.riskReduction != null ? `${(s.riskReduction * 100).toFixed(1)}%` : "N/A"}
                        </p>
                      </div>
                    </div>
                    {s.confidenceLevel && (
                      <p className="text-xs muted" style={{ margin: 0 }}>Confidence: {s.confidenceLevel}</p>
                    )}
                    {assumptionList.length > 0 && (
                      <div>
                        <p className="text-xs uppercase muted" style={{ margin: "0.25rem 0 0.2rem 0" }}>Assumptions</p>
                        <ul className="text-xs muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                          {assumptionList.map((a: string, i: number) => (
                            <li key={i}>{typeof a === "string" ? a : String(a)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleExecute(s.id)} disabled={!!loadingId || !!draftedPlan} className={`btn${rec ? " primary" : ""} btn-sm`} style={{ width: "100%", marginTop: "auto" }}>
                    {loadingId === s.id ? "Drafting…" : draftedPlan ? "Drafted" : "Draft Execution"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Execution Draft */}
      {draftedPlan?.actions && (
        <div className="stack" style={{ borderTop: !isExecuted ? "1px solid var(--border)" : "none", paddingTop: !isExecuted ? "1rem" : 0 }}>
          <h4>{isExecuted ? "Executed Playbook" : "Execution Draft"}</h4>
          {draftedPlan.summary && <p className="muted text-sm" style={{ margin: 0 }}>{draftedPlan.summary}</p>}

          <p className="text-sm muted" style={{ margin: 0 }}>
            {!isExecuted ? "Insights and recommendations are suggestions only. Select which executable steps to run (email, Zapier, etc.), then Approve & Fire." : "Actions that were executed."}
          </p>

          <div className="stack-sm">
            {actions.map((action: any, idx: number) => (
              <div key={idx} className="trace-row" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {editingIdx === idx && editForm ? (
                  <div className="stack-sm" style={{ padding: "0.75rem", background: "var(--bg-soft)", borderRadius: "var(--radius)" }}>
                    <label className="stack-xs" style={{ margin: 0 }}>
                      <span className="text-xs font-medium">Step title</span>
                      <input
                        type="text"
                        className="input"
                        value={editForm.stepTitle}
                        onChange={(e) => setEditForm((f) => f ? { ...f, stepTitle: e.target.value } : null)}
                        placeholder="e.g. Notify primary supplier"
                      />
                    </label>
                    <label className="stack-xs" style={{ margin: 0 }}>
                      <span className="text-xs font-medium">Recipient / endpoint</span>
                      <input
                        type="text"
                        className="input"
                        value={editForm.recipientOrEndpoint}
                        onChange={(e) => setEditForm((f) => f ? { ...f, recipientOrEndpoint: e.target.value } : null)}
                        placeholder="Email or endpoint"
                      />
                    </label>
                    <label className="stack-xs" style={{ margin: 0 }}>
                      <span className="text-xs font-medium">Payload / body</span>
                      <textarea
                        className="input"
                        value={editForm.payloadOrBody}
                        onChange={(e) => setEditForm((f) => f ? { ...f, payloadOrBody: e.target.value } : null)}
                        placeholder="JSON or message body"
                        rows={4}
                        style={{ resize: "vertical", minHeight: "4rem" }}
                      />
                    </label>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      <button type="button" className="btn primary btn-sm" onClick={saveEdit} disabled={savingEdit}>
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="btn secondary btn-sm" onClick={cancelEdit} disabled={savingEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                      {!isExecuted && !isSuggestionType(action?.type) && (
                        <label className="row" style={{ alignItems: "center", gap: "0.35rem", cursor: "pointer", flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedActionIndices.has(idx)}
                            onChange={() => toggleAction(idx)}
                          />
                          <span className="text-xs">Run</span>
                        </label>
                      )}
                      {isSuggestionType(action?.type) && (
                        <span className="badge" style={{ flexShrink: 0, alignSelf: "flex-start", background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                          {action.type === "insight" ? "Insight" : "Recommendation"}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0, ...(isSuggestionType(action?.type) ? { padding: "0.5rem 0.75rem", background: "var(--bg-soft)", borderRadius: "var(--radius)", borderLeft: "3px solid var(--accent)" } : {}) }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.35rem" }}>
                          <div className="trace-meta" style={{ margin: 0 }}>
                            <span className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
                              Step {idx + 1}{action.stepTitle ? `: ${action.stepTitle}` : ""}
                            </span>
                            {!isSuggestionType(action?.type) && (
                              <span className="text-xs uppercase muted" style={{ marginLeft: "0.35rem" }}>{action.type}</span>
                            )}
                          </div>
                          {!isExecuted && (
                            <button
                              type="button"
                              className="btn secondary btn-sm"
                              onClick={() => startEdit(idx)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {action.recipientOrEndpoint && !isSuggestionType(action?.type) && (
                          <p className="text-xs muted" style={{ margin: "0.2rem 0 0 0" }}>To: {action.recipientOrEndpoint}</p>
                        )}
                        <div className="trace-body text-sm" style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {action.payloadOrBody}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {!isExecuted && (
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button className="btn primary" onClick={handleApprove} disabled={isExecuting || executableCount === 0}>
                {isExecuting ? "Executing…" : executableCount === 0 ? "Select steps to run" : executableCount === totalExecutable ? "Approve & Fire All" : `Execute ${executableCount} selected`}
              </button>
              <button className="btn secondary" onClick={handleDeleteDraft} disabled={deletingDraft || isExecuting}>
                {deletingDraft ? "Deleting…" : "Delete draft"}
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}
    </section>
  );
}
