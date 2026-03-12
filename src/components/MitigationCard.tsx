"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatedAutoHeight } from "@/components/AnimatedAutoHeight";
import { AnimeStagger } from "@/components/AnimeStagger";
import { ConfirmModal } from "@/components/ConfirmModal";

/** Probability may be stored as 0–1 or 0–100; return 0–100 for display */
function probabilityToPercent(n: number): number {
  if (n > 1) return Math.min(100, Math.max(0, n));
  return Math.min(100, Math.max(0, n * 100));
}

/** Cost delta: stored as multiplier (1.15 = +15%). If value > 10, LLM likely returned percent — show as percent and cap. */
function formatCostDelta(cd: number | null | undefined): string {
  if (cd == null) return "N/A";
  if (cd > 10) return `${Math.min(500, Math.round(cd)).toFixed(0)}%`;
  const pct = (cd * 100 - 100);
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

/** Service / Risk: stored as 0–1. If value > 1, LLM likely returned 0–100 — use as percent and cap. */
function formatPercent01Or100(n: number | null | undefined): string {
  if (n == null) return "N/A";
  const pct = n > 1 ? Math.min(100, n) : n * 100;
  return `${pct.toFixed(1)}%`;
}

function formatDeferredAt(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function formatActionPayload(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type ExecutionArtifact = {
  format: "csv" | "excel" | "google_sheets";
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
  destination?: string;
  preview?: string;
};

type FinancialReportFormat = "google_sheets" | "excel" | "csv";
type FinancialReportPayloadUi = {
  format?: FinancialReportFormat;
  spreadsheetTitle?: string;
  tabs?: Array<{ name?: string; section?: string }>;
};

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type DownloadResult = "picker" | "fallback" | "none";

function supportsSaveFilePicker(): boolean {
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
}

async function openSaveHandleForFormat(format: FinancialReportFormat, planId: string): Promise<any | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (opts?: unknown) => Promise<any> }).showSaveFilePicker;
  if (typeof picker !== "function") return null;
  const ext = format === "csv" ? "csv" : "xlsx";
  const mime = ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  try {
    return await picker({
      suggestedName: `financial-impact-${planId}.${ext}`,
      types: [
        {
          description: ext === "csv" ? "CSV file" : "Excel file",
          accept: { [mime]: [`.${ext}`] },
        },
      ],
    });
  } catch {
    return null;
  }
}

async function writeArtifactToHandle(artifact: ExecutionArtifact, handle: any): Promise<boolean> {
  if (!artifact?.contentBase64 || !handle?.createWritable) return false;
  try {
    const bytes = decodeBase64ToBytes(artifact.contentBase64);
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const blob = new Blob([arrayBuffer], {
      type: artifact.mimeType || "application/octet-stream",
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function downloadArtifact(
  artifact: ExecutionArtifact,
  options?: { preferPicker?: boolean; allowFallback?: boolean }
): Promise<DownloadResult> {
  if (!artifact.contentBase64 || !artifact.fileName) return "none";
  const bytes = decodeBase64ToBytes(artifact.contentBase64);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], {
    type: artifact.mimeType || "application/octet-stream",
  });
  const preferPicker = options?.preferPicker ?? true;
  const allowFallback = options?.allowFallback ?? true;
  const picker = (window as unknown as { showSaveFilePicker?: (opts?: unknown) => Promise<any> }).showSaveFilePicker;
  if (preferPicker && typeof picker === "function") {
    try {
      const ext = artifact.fileName.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
      const handle = await picker({
        suggestedName: artifact.fileName,
        types: [
          {
            description: ext === "csv" ? "CSV file" : "Excel file",
            accept: {
              [artifact.mimeType || (ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")]:
                [`.${ext}`],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch {
      if (!allowFallback) return "none";
      // User cancelled picker or browser blocked; fallback to regular download.
    }
  }
  if (!allowFallback) return "none";
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return "fallback";
}

type MitigationCardProps = {
  riskCase: any;
  archived?: boolean;
  /** For active cards: only first should be true so first is expanded by default */
  defaultExpanded?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
};

function defaultFinancialReportPayloadForUi(): string {
  return JSON.stringify({
    format: "csv",
    tabs: [
      { name: "Overview", section: "overview" },
      { name: "Financial Impact", section: "financial_impact" },
      { name: "Scenario Comparison", section: "scenario_comparison" },
      { name: "Drivers & Assumptions", section: "drivers_assumptions" },
      { name: "Signal Details", section: "signal_details" },
    ],
  });
}

function normalizeDraftedPlan(plan: any | null): any | null {
  if (!plan || !Array.isArray(plan.actions)) return plan;
  const actions = [...plan.actions];
  const idx = actions.findIndex((a: any) => a?.type === "financial_report");
  const fallbackPayload = defaultFinancialReportPayloadForUi();
  if (idx === -1) {
    actions.push({
      type: "financial_report",
      recipientOrEndpoint: "",
      payloadOrBody: fallbackPayload,
      requiresHumanApproval: false,
      stepTitle: "Draft detailed financial impact export",
    });
    return { ...plan, actions };
  }
  const current = actions[idx] ?? {};
  let payload = typeof current.payloadOrBody === "string" ? current.payloadOrBody : "";
  try {
    const parsed = JSON.parse(payload || "{}") as { format?: unknown; tabs?: unknown[] };
    const hasFormat = typeof parsed.format === "string" && parsed.format.length > 0;
    const hasTabs = Array.isArray(parsed.tabs) && parsed.tabs.length > 0;
    if (!hasFormat || !hasTabs) payload = fallbackPayload;
  } catch {
    payload = fallbackPayload;
  }
  actions[idx] = {
    ...current,
    recipientOrEndpoint: current.recipientOrEndpoint ?? "",
    payloadOrBody: payload,
    stepTitle: current.stepTitle || "Draft detailed financial impact export",
  };
  return { ...plan, actions };
}

function parseFinancialPayloadForUi(raw: unknown): FinancialReportPayloadUi {
  if (typeof raw !== "string" || !raw.trim()) return { format: "csv" };
  try {
    const parsed = JSON.parse(raw) as FinancialReportPayloadUi;
    return {
      format:
        parsed?.format === "google_sheets" || parsed?.format === "excel" || parsed?.format === "csv"
          ? parsed.format
          : "csv",
      spreadsheetTitle: typeof parsed?.spreadsheetTitle === "string" ? parsed.spreadsheetTitle : "",
      tabs: Array.isArray(parsed?.tabs) ? parsed.tabs : undefined,
    };
  } catch {
    return { format: "csv" };
  }
}

function toFinancialPayloadString(input: FinancialReportPayloadUi): string {
  const tabs =
    Array.isArray(input.tabs) && input.tabs.length > 0
      ? input.tabs
      : [
          { name: "Overview", section: "overview" },
          { name: "Financial Impact", section: "financial_impact" },
          { name: "Scenario Comparison", section: "scenario_comparison" },
          { name: "Drivers & Assumptions", section: "drivers_assumptions" },
          { name: "Signal Details", section: "signal_details" },
        ];
  return JSON.stringify(
    {
      format: input.format ?? "csv",
      ...(input.spreadsheetTitle?.trim() ? { spreadsheetTitle: input.spreadsheetTitle.trim() } : {}),
      tabs,
    },
    null,
    2
  );
}

function getFinancialReportActionIndex(actions: any[]): number {
  return actions.findIndex((a) => a?.type === "financial_report");
}

function getFinancialFormatFromAction(action: any): FinancialReportFormat {
  const parsed = parseFinancialPayloadForUi(formatActionPayload(action?.payloadOrBody));
  return parsed.format ?? "csv";
}

function artifactStorageKey(planId: string): string {
  return `htf-mitigation-artifacts:${planId}`;
}

export function MitigationCard({
  riskCase: rc,
  archived = false,
  defaultExpanded = true,
  selectable = false,
  selected = false,
  onSelectedChange,
}: MitigationCardProps) {
  const router = useRouter();
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(defaultExpanded);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [draftedPlan, setDraftedPlan] = useState<any | null>(normalizeDraftedPlan(rc.mitigationPlans?.[0] || null));
  const [isExecuting, setIsExecuting] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [deletingCase, setDeletingCase] = useState(false);
  const [cloningPlan, setCloningPlan] = useState(false);
  const [selectedActionIndices, setSelectedActionIndices] = useState<Set<number>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ stepTitle: string; recipientOrEndpoint: string; payloadOrBody: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteCaseOpen, setConfirmDeleteCaseOpen] = useState(false);
  const [confirmDeleteDraftOpen, setConfirmDeleteDraftOpen] = useState(false);
  const [executionArtifacts, setExecutionArtifacts] = useState<ExecutionArtifact[]>([]);
  const [sheetsEnabled, setSheetsEnabled] = useState(false);
  const [financialReportFormat, setFinancialReportFormat] = useState<FinancialReportFormat>("csv");

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

  useEffect(() => {
    const planId = draftedPlan?.id;
    if (!planId || typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(artifactStorageKey(planId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as ExecutionArtifact[];
      if (Array.isArray(parsed)) setExecutionArtifacts(parsed);
    } catch {
      // ignore storage parse errors
    }
  }, [draftedPlan?.id]);

  useEffect(() => {
    const idx = getFinancialReportActionIndex(actions);
    if (idx < 0) {
      setFinancialReportFormat("csv");
      return;
    }
    setFinancialReportFormat(getFinancialFormatFromAction(actions[idx]));
  }, [draftedPlan?.id, draftedPlan?.actions, actions.length]);

  useEffect(() => {
    let active = true;
    fetch("/api/zapier/tool-selections")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const tools = Array.isArray(data?.executionTools) ? (data.executionTools as string[]) : [];
        const hasSheets = tools.some((name) => {
          const n = String(name || "").toLowerCase();
          return n.includes("sheet") || n.includes("google sheets");
        });
        setSheetsEnabled(hasSheets);
      })
      .catch(() => {
        if (!active) return;
        setSheetsEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        const normalizedPlan = normalizeDraftedPlan(data.plan);
        setDraftedPlan(normalizedPlan);
        setSelectedActionIndices(new Set((normalizedPlan?.actions ?? []).map((_: unknown, i: number) => i)));
        setExecutionArtifacts([]);
      } else alert(data.error);
    } catch { alert("Failed to draft plan"); } finally { setLoadingId(null); }
  };

  const handleApprove = async () => {
    if (!draftedPlan?.id) return;
    const indices = selectedActionIndices.size > 0
      ? Array.from(selectedActionIndices)
      : actions.map((_: unknown, i: number) => i);
    const financialIdx = getFinancialReportActionIndex(actions);
    if (financialIdx >= 0 && !indices.includes(financialIdx)) {
      indices.push(financialIdx);
    }
    try {
      setIsExecuting(true);
      const preselectedSaveHandle =
        financialIdx >= 0 &&
        indices.includes(financialIdx) &&
        (financialReportFormat === "csv" || financialReportFormat === "excel") &&
        supportsSaveFilePicker()
          ? await openSaveHandleForFormat(financialReportFormat, draftedPlan.id)
          : null;
      const res = await fetch("/api/agents/mitigation-action/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: draftedPlan.id,
          actionIndices: indices,
          actions: draftedPlan.actions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const artifacts: ExecutionArtifact[] = Array.isArray(data.executionResults?.artifacts)
          ? data.executionResults.artifacts
          : [];
        setExecutionArtifacts(artifacts);
        if (draftedPlan?.id && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(artifactStorageKey(draftedPlan.id), JSON.stringify(artifacts));
          } catch {
            // ignore storage failures
          }
        }
        const hadFailures = data.executionResults?.failed?.length > 0;
        const downloadable = artifacts.filter((a) => !!a.contentBase64 && !!a.fileName);
        if (downloadable.length > 0) {
          if (preselectedSaveHandle) {
            const preferred = downloadable.find((a) => a.format === financialReportFormat) ?? downloadable[0];
            if (preferred) await writeArtifactToHandle(preferred, preselectedSaveHandle);
          }
        }
        if (!hadFailures) {
          setDraftedPlan({ ...draftedPlan, status: "EXECUTED" });
          router.refresh();
        } else {
          const lines = data.executionResults.failed.map(
            (f: { stepTitle?: string; error: string }) => `${f.stepTitle ?? "Action"}: ${f.error}`
          );
          alert("Some actions failed. Plan stayed in draft.\n\n" + lines.join("\n\n"));
        }
      } else {
        const msg = data.error || (res.ok ? "Execution failed" : `Request failed (${res.status})`);
        alert(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to execute plan (network or server error)";
      alert(msg);
    } finally { setIsExecuting(false); }
  };

  const handleDeleteDraftConfirm = async () => {
    if (!draftedPlan?.id || draftedPlan?.status === "EXECUTED") return;
    try {
      setDeletingDraft(true);
      const res = await fetch(`/api/mitigation-plans/${draftedPlan.id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDeleteDraftOpen(false);
        if (draftedPlan?.id && typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem(artifactStorageKey(draftedPlan.id));
          } catch {
            // ignore storage failures
          }
        }
        setDraftedPlan(null);
        setSelectedActionIndices(new Set());
        setExecutionArtifacts([]);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete draft");
      }
    } catch { alert("Failed to delete draft"); } finally { setDeletingDraft(false); }
  };

  const handleRedraft = async () => {
    if (!draftedPlan || draftedPlan?.status === "EXECUTED") return;
    const scenarioId = draftedPlan.scenarioId ?? rc.scenarios?.[0]?.id;
    if (!scenarioId) {
      alert("No scenario to redraft from.");
      return;
    }
    try {
      setLoadingId(scenarioId);
      if (draftedPlan.id) {
        await fetch(`/api/mitigation-plans/${draftedPlan.id}`, { method: "DELETE" });
      }
      const res = await fetch("/api/agents/mitigation-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskCaseId: rc.id, scenarioId }),
      });
      const data = await res.json();
      if (data.success) {
        if (draftedPlan?.id && typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem(artifactStorageKey(draftedPlan.id));
          } catch {
            // ignore storage failures
          }
        }
        const normalizedPlan = normalizeDraftedPlan(data.plan);
        setDraftedPlan(normalizedPlan);
        setSelectedActionIndices(new Set((normalizedPlan?.actions ?? []).map((_: unknown, i: number) => i)));
        setExecutionArtifacts([]);
        router.refresh();
      } else alert(data.error || "Failed to redraft");
    } catch { alert("Failed to redraft"); } finally { setLoadingId(null); }
  };

  const openDeleteCaseConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rc.id || deletingCase) return;
    setConfirmDeleteCaseOpen(true);
  };

  const handleDeleteCaseConfirm = async () => {
    if (!rc.id) return;
    try {
      setDeletingCase(true);
      const res = await fetch(`/api/risk/cases/${rc.id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDeleteCaseOpen(false);
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
    const isFinancialReport = action.type === "financial_report";
    const normalizedPayload = isFinancialReport
      ? toFinancialPayloadString(parseFinancialPayloadForUi(formatActionPayload(action.payloadOrBody)))
      : formatActionPayload(action.payloadOrBody);
    setEditingIdx(idx);
    setEditForm({
      stepTitle: action.stepTitle ?? "",
      recipientOrEndpoint: action.recipientOrEndpoint ?? "",
      payloadOrBody: normalizedPayload,
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

  const updateFinancialReportFormat = (nextFormat: FinancialReportFormat) => {
    const idx = getFinancialReportActionIndex(actions);
    if (idx < 0 || !draftedPlan) return;
    const target = actions[idx];
    const current = parseFinancialPayloadForUi(formatActionPayload(target.payloadOrBody));
    const nextPayload = toFinancialPayloadString({
      ...current,
      format: nextFormat,
      spreadsheetTitle:
        nextFormat === "google_sheets"
          ? (current.spreadsheetTitle || `Financial impact - ${rc.triggerType ?? "Risk"}`)
          : current.spreadsheetTitle,
    });
    const updatedActions = [...actions];
    updatedActions[idx] = {
      ...target,
      payloadOrBody: nextPayload,
      stepTitle: target?.stepTitle || "Draft detailed financial impact export",
    };
    setDraftedPlan({ ...draftedPlan, actions: updatedActions });
    setFinancialReportFormat(nextFormat);
  };

  const runFinancialExportOnly = async () => {
    if (!draftedPlan?.id) return;
    const idx = getFinancialReportActionIndex(actions);
    if (idx < 0) {
      alert("No financial report step found in this plan.");
      return;
    }
    try {
      setIsExecuting(true);
      const financialAction = actions[idx];
      if (!financialAction) {
        alert("No financial report step found in this plan.");
        return;
      }
      const preselectedSaveHandle =
        (financialReportFormat === "csv" || financialReportFormat === "excel") && supportsSaveFilePicker()
          ? await openSaveHandleForFormat(financialReportFormat, draftedPlan.id)
          : null;
      const res = await fetch("/api/agents/mitigation-action/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: draftedPlan.id,
          actionIndices: [0],
          // Strict file-only execution path: Gemini generates document content,
          // and no other plan actions are executed.
          actions: [financialAction],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        alert(data.error || "Failed to generate financial export.");
        return;
      }
      const artifacts: ExecutionArtifact[] = Array.isArray(data.executionResults?.artifacts)
        ? data.executionResults.artifacts
        : [];
      setExecutionArtifacts(artifacts);
      if (draftedPlan?.id && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(artifactStorageKey(draftedPlan.id), JSON.stringify(artifacts));
        } catch {
          // ignore storage failures
        }
      }
      const downloadable = artifacts.filter((a) => !!a.contentBase64 && !!a.fileName);
      if (downloadable.length > 0 && preselectedSaveHandle) {
        await writeArtifactToHandle(downloadable[0], preselectedSaveHandle);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate financial export.";
      alert(msg);
    } finally {
      setIsExecuting(false);
    }
  };

  const isExecuted = draftedPlan?.status === "EXECUTED";
  const isExpanded = archived ? archivedExpanded : activeExpanded;
  /** Current case with a draft plan waiting for user to Approve & Fire — show warning so user knows confirmation is needed */
  const needsConfirmation = !archived && !!draftedPlan && draftedPlan.status !== "EXECUTED";
  const deferredReason = draftedPlan?.autonomousExecutionDeferred ?? null;

  const isSuggestionType = (type: string) => type === "insight" || type === "recommendation";
  const totalExecutable = actions.filter((a: any) => !isSuggestionType(a?.type)).length;
  const executableCount = actions.filter((a: any, i: number) => selectedActionIndices.has(i) && !isSuggestionType(a?.type)).length;

  return (
    <>
      <ConfirmModal
        open={confirmDeleteCaseOpen}
        title="Delete mitigation plan"
        message="Remove this mitigation plan? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingCase}
        onConfirm={handleDeleteCaseConfirm}
        onCancel={() => setConfirmDeleteCaseOpen(false)}
      />
      <ConfirmModal
        open={confirmDeleteDraftOpen}
        title="Delete draft"
        message="Remove this draft plan? You can redraft from the same scenario later."
        confirmLabel="Delete draft"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletingDraft}
        onConfirm={handleDeleteDraftConfirm}
        onCancel={() => setConfirmDeleteDraftOpen(false)}
      />
      <section
        className={`card stack-lg mitigation-card${selected ? " is-selected" : ""}`}
        data-animate-item
        style={{
          opacity: isExecuted ? 0.75 : 1,
          ...(needsConfirmation && {
            borderLeft: "4px solid var(--warning)",
            background: "var(--warning-soft)",
          }),
        }}
      >
      {/* Header */}
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          borderBottom: !isExpanded ? "none" : "1px solid var(--border)",
          paddingBottom: "1rem",
          cursor: "pointer",
          alignItems: "center",
        }}
        onClick={archived ? () => setArchivedExpanded((e) => !e) : () => setActiveExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => ev.key === "Enter" && (archived ? setArchivedExpanded((e) => !e) : setActiveExpanded((e) => !e))}
        aria-expanded={isExpanded}
      >
        <div className="row" style={{ alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
          {selectable && (
            <label
              className="row"
              style={{ alignItems: "center", gap: "0.35rem", cursor: "pointer", flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onSelectedChange?.(e.target.checked)}
                aria-label={`Select ${rc.triggerType?.toLowerCase?.() ?? "mitigation"} plan`}
              />
              <span className="text-xs muted">Select</span>
            </label>
          )}
          <span className="muted" style={{ fontSize: "0.875rem", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} aria-hidden>
            &gt;
          </span>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.4rem", textDecoration: isExecuted ? "line-through" : "none", margin: 0, flexWrap: "wrap" }}>
              <span className="dot danger" />
              {rc.triggerType?.toUpperCase?.() ?? "Risk"}
              {(rc as { createdByAutonomousAgent?: boolean }).createdByAutonomousAgent && (
                <span
                  className="text-xs"
                  style={{
                    padding: "0.15rem 0.5rem",
                    borderRadius: 4,
                    background: "var(--warning-soft)",
                    color: "var(--warning)",
                    fontWeight: 500,
                  }}
                  title="Risk assessment created by autonomous agent"
                >
                  Autonomous
                </span>
              )}
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
            onClick={openDeleteCaseConfirm}
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

      <AnimatedAutoHeight open={isExpanded}>
        <div className="stack-lg" style={{ paddingTop: "1rem" }}>
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
          <AnimeStagger
            className="scenario-cards-grid"
            play={isExpanded}
            playKey={`${String(rc.id)}-${draftedPlan?.id ?? "no-draft"}-${String(isExpanded)}`}
          >
            {rc.scenarios?.map((s: any) => {
              const rec = s.recommendation === "RECOMMENDED";
              const assumptions = s.assumptions;
              const assumptionList = Array.isArray(assumptions) ? assumptions : typeof assumptions === "string" ? [assumptions] : [];
              return (
                <div key={s.id} className={`scenario-card${rec ? " recommended" : ""}`} data-animate-item>
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
                          {formatCostDelta(s.costDelta)}
                        </p>
                      </div>
                      <div className="card-flat">
                        <p className="text-xs uppercase muted">Service</p>
                        <p className="text-sm font-semibold" style={{ color: s.serviceImpact != null && s.serviceImpact < 0 ? "var(--danger)" : "var(--success)" }}>
                          {formatPercent01Or100(s.serviceImpact)}
                        </p>
                      </div>
                      <div className="card-flat">
                        <p className="text-xs uppercase muted">Risk Reduction</p>
                        <p className="text-sm font-semibold">
                          {formatPercent01Or100(s.riskReduction)}
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
                  <button onClick={() => handleExecute(s.id)} disabled={!!loadingId || !!draftedPlan} className={`btn ${rec ? "primary" : "secondary"} btn-sm`} style={{ width: "100%", marginTop: "auto" }}>
                    {loadingId === s.id ? "Drafting…" : draftedPlan ? "Drafted" : "Draft Execution"}
                  </button>
                </div>
              );
            })}
          </AnimeStagger>
        </div>
      )}

      {/* Execution Draft */}
      {draftedPlan?.actions && (
        <div className="stack" style={{ borderTop: !isExecuted ? "1px solid var(--border)" : "none", paddingTop: !isExecuted ? "1rem" : 0 }}>
          <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {isExecuted ? "Executed Memory" : "Execution Draft"}
            {draftedPlan?.createdByAutonomousAgent && (
              <span
                className="text-xs"
                style={{
                  padding: "0.15rem 0.5rem",
                  borderRadius: 4,
                  background: "var(--accent-soft)",
                  color: "var(--accent-text)",
                  fontWeight: 500,
                }}
                title="Mitigation plan created by autonomous agent"
              >
                Autonomous
              </span>
            )}
          </h4>
          {draftedPlan.summary && <p className="muted text-sm" style={{ margin: 0 }}>{draftedPlan.summary}</p>}

          {!isExecuted && deferredReason?.summary && (
            <div
              className="card-flat stack-xs"
              style={{
                padding: "0.75rem 1rem",
                background: "var(--warning-soft)",
                borderLeft: "3px solid var(--warning)",
              }}
            >
              <p className="text-sm" style={{ margin: 0, color: "var(--warning)" }}>
                {deferredReason.summary}
              </p>
              {deferredReason?.createdAt && (
                <p className="text-xs muted" style={{ margin: 0 }}>
                  Logged {formatDeferredAt(deferredReason.createdAt)}.
                </p>
              )}
            </div>
          )}

          <p className="text-sm muted" style={{ margin: 0 }}>
            {!isExecuted ? "Insights and recommendations are suggestions only. Select which executable steps to run (email, Zapier, etc.), then Approve & Fire." : "Actions that were executed."}
          </p>

          {!isExecuted && getFinancialReportActionIndex(actions) >= 0 && (
            <div className="card-flat stack-xs" style={{ padding: "0.75rem 1rem" }}>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Financial report output</p>
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  className="input"
                  style={{ maxWidth: 320 }}
                  value={financialReportFormat}
                  onChange={(e) => updateFinancialReportFormat(e.target.value as FinancialReportFormat)}
                >
                  {sheetsEnabled ? (
                    <option value="google_sheets">Create new Google Sheet</option>
                  ) : (
                    <option value="google_sheets" disabled>Create new Google Sheet (enable Sheets in Integrations)</option>
                  )}
                  <option value="excel">Download Excel (.xlsx)</option>
                  <option value="csv">Download CSV (.csv)</option>
                </select>
                <span className="text-xs muted">Set this before Approve & Fire.</span>
                <button type="button" className="btn secondary btn-sm" onClick={runFinancialExportOnly} disabled={isExecuting}>
                  {isExecuting ? "Generating…" : "Generate export only"}
                </button>
              </div>
            </div>
          )}

          {isExecuted && getFinancialReportActionIndex(actions) >= 0 && (
            <div className="card-flat stack-xs" style={{ padding: "0.75rem 1rem" }}>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Financial report output</p>
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <select
                  className="input"
                  style={{ maxWidth: 320 }}
                  value={financialReportFormat}
                  onChange={(e) => updateFinancialReportFormat(e.target.value as FinancialReportFormat)}
                  disabled={isExecuting}
                >
                  {sheetsEnabled ? (
                    <option value="google_sheets">Create new Google Sheet</option>
                  ) : (
                    <option value="google_sheets" disabled>Create new Google Sheet (enable Sheets in Integrations)</option>
                  )}
                  <option value="excel">Download Excel (.xlsx)</option>
                  <option value="csv">Download CSV (.csv)</option>
                </select>
                <button type="button" className="btn secondary btn-sm" onClick={runFinancialExportOnly} disabled={isExecuting}>
                  {isExecuting ? "Generating…" : "Generate export now"}
                </button>
              </div>
            </div>
          )}

          {executionArtifacts.length > 0 && (
            <div className="card-flat stack-xs" style={{ padding: "0.75rem 1rem" }}>
              <p className="text-xs uppercase muted" style={{ margin: 0 }}>Generated outputs</p>
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                {executionArtifacts.filter((a) => a.contentBase64 && a.fileName).map((artifact, idx) => (
                  <div key={`${artifact.fileName ?? "artifact"}-${idx}`} className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={async () => {
                        const result = await downloadArtifact(artifact, { preferPicker: true, allowFallback: false });
                        if (result !== "picker") {
                          alert("Save As popup is not available in this browser context. Use Chrome/Edge on localhost/https, then click Save As… again.");
                        }
                      }}
                    >
                      Save As… {artifact.fileName ?? `${artifact.format} export`}
                    </button>
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() => void downloadArtifact(artifact, { preferPicker: false, allowFallback: true })}
                    >
                      Quick download
                    </button>
                  </div>
                ))}
              </div>
              {executionArtifacts
                .filter((a) => a.format === "google_sheets")
                .map((artifact, idx) => (
                  <p key={`sheet-${idx}`} className="text-xs muted" style={{ margin: 0 }}>
                    {artifact.preview || "Google Sheets export completed."}
                  </p>
                ))}
            </div>
          )}

          <AnimeStagger
            className="stack-sm"
            play={isExpanded}
            playKey={`${draftedPlan?.id ?? "no-draft"}-${actions.length}-${String(isExpanded)}`}
            delayStep={45}
            duration={420}
            translateY={10}
            scale={0.992}
          >
            {actions.map((action: any, idx: number) => (
              <div key={idx} className="trace-row" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }} data-animate-item>
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
                          {formatActionPayload(action.payloadOrBody)}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </AnimeStagger>

          {!isExecuted && (
            <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <button className="btn primary" onClick={handleApprove} disabled={isExecuting || executableCount === 0}>
                {isExecuting ? "Executing…" : executableCount === 0 ? "Select steps to run" : executableCount === totalExecutable ? "Approve & Fire All" : `Execute ${executableCount} selected`}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={handleRedraft}
                disabled={!!loadingId || deletingDraft || isExecuting}
                title="Generate a new draft from the same scenario"
              >
                {loadingId ? "Redrafting…" : "Redraft"}
              </button>
              <button className="btn secondary" onClick={() => setConfirmDeleteDraftOpen(true)} disabled={deletingDraft || isExecuting}>
                {deletingDraft ? "Deleting…" : "Delete draft"}
              </button>
            </div>
          )}
        </div>
      )}
        </div>
      </AnimatedAutoHeight>
    </section>
    </>
  );
}
