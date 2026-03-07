import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type LogEntrySerialized = {
  id: string;
  runId: string;
  actionType: string;
  signalType: string | null;
  signalId: string | null;
  riskCaseId: string | null;
  planId: string | null;
  summary: string | null;
  details: unknown;
  createdAt: string;
  /** Filled when signalId + signalType present */
  signal?: {
    type: "internal" | "external";
    source?: string | null;
    toolName?: string;
    signalSummary?: string | null;
    title?: string;
    snippet?: string;
    url?: string | null;
    rawContent?: unknown;
  };
  /** Filled when riskCaseId present */
  riskCase?: {
    id: string;
    triggerType: string;
    createdByAutonomousAgent: boolean;
    entityMap: unknown;
    timeWindow: unknown;
    probabilityPoint: number | null;
    probabilityBandLow: number | null;
    probabilityBandHigh: number | null;
    confidenceLevel: string | null;
    keyDrivers: unknown;
    severity: string | null;
    serviceImpact: unknown;
    financialImpact: unknown;
    scenarios: Array<{ id: string; name: string; recommendation: string }>;
  };
  /** Filled when planId present */
  plan?: {
    id: string;
    status: string;
    executionMode: string;
    actions: unknown;
    riskCaseTriggerType?: string;
    createdByAutonomousAgent: boolean;
  };
};

/** GET /api/agents/autonomous/logs — returns autonomous agent logs grouped by run, with full signal/risk/plan expanded. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let logs: LogEntrySerialized[] = [];

    try {
      const rows = await db.autonomousAgentLog.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      logs = rows.map((r) => ({
        id: r.id,
        runId: r.runId,
        actionType: r.actionType,
        signalType: r.signalType,
        signalId: r.signalId,
        riskCaseId: r.riskCaseId,
        planId: r.planId,
        summary: r.summary,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch {
      // autonomousAgentLog may be missing if Prisma client is stale
    }

    const companyId = session.companyId;
    const internalSignalIds = [...new Set(logs.filter((l) => l.signalType === "internal" && l.signalId).map((l) => l.signalId!))];
    const externalSignalIds = [...new Set(logs.filter((l) => l.signalType === "external" && l.signalId).map((l) => l.signalId!))];
    const riskCaseIds = [...new Set(logs.filter((l) => l.riskCaseId).map((l) => l.riskCaseId!))];
    const planIds = [...new Set(logs.filter((l) => l.planId).map((l) => l.planId!))];

    let internalSignals: Map<string, { source: string; toolName: string; signalSummary: string | null; rawContent: unknown }> = new Map();
    let externalSignals: Map<string, { title: string; snippet: string; url: string | null; source: string | null }> = new Map();
    let riskCases: Map<string, LogEntrySerialized["riskCase"]> = new Map();
    let plans: Map<string, LogEntrySerialized["plan"]> = new Map();

    try {
      if (internalSignalIds.length > 0) {
        const events = await db.ingestedEvent.findMany({
          where: { id: { in: internalSignalIds }, companyId },
          select: { id: true, source: true, toolName: true, signalSummary: true, rawContent: true },
        });
        events.forEach((e) => internalSignals.set(e.id, { source: e.source, toolName: e.toolName, signalSummary: e.signalSummary, rawContent: e.rawContent }));
      }
      if (externalSignalIds.length > 0) {
        const signals = await db.savedExternalSignal.findMany({
          where: { id: { in: externalSignalIds }, companyId },
          select: { id: true, title: true, snippet: true, url: true, source: true },
        });
        signals.forEach((s) => externalSignals.set(s.id, { title: s.title, snippet: s.snippet, url: s.url, source: s.source }));
      }
      if (riskCaseIds.length > 0) {
        const cases = await db.riskCase.findMany({
          where: { id: { in: riskCaseIds }, companyId },
          include: { scenarios: { select: { id: true, name: true, recommendation: true } } },
        });
        cases.forEach((rc) =>
          riskCases.set(rc.id, {
            id: rc.id,
            triggerType: rc.triggerType,
            createdByAutonomousAgent: rc.createdByAutonomousAgent,
            entityMap: rc.entityMap,
            timeWindow: rc.timeWindow,
            probabilityPoint: rc.probabilityPoint,
            probabilityBandLow: rc.probabilityBandLow,
            probabilityBandHigh: rc.probabilityBandHigh,
            confidenceLevel: rc.confidenceLevel,
            keyDrivers: rc.keyDrivers,
            severity: rc.severity,
            serviceImpact: rc.serviceImpact,
            financialImpact: rc.financialImpact,
            scenarios: rc.scenarios.map((s) => ({ id: s.id, name: s.name, recommendation: s.recommendation })),
          })
        );
      }
      if (planIds.length > 0) {
        const planRows = await db.mitigationPlan.findMany({
          where: { id: { in: planIds }, companyId },
          include: { riskCase: { select: { triggerType: true } } },
        });
        planRows.forEach((p) =>
          plans.set(p.id, {
            id: p.id,
            status: p.status,
            executionMode: p.executionMode,
            actions: p.actions,
            riskCaseTriggerType: p.riskCase?.triggerType,
            createdByAutonomousAgent: p.createdByAutonomousAgent,
          })
        );
      }
    } catch (e) {
      console.error("Logs expand error:", e);
    }

    for (const log of logs) {
      if (log.signalId && log.signalType === "internal") {
        const s = internalSignals.get(log.signalId);
        if (s) log.signal = { type: "internal", ...s };
      }
      if (log.signalId && log.signalType === "external") {
        const s = externalSignals.get(log.signalId);
        if (s) log.signal = { type: "external", ...s };
      }
      if (log.riskCaseId) log.riskCase = riskCases.get(log.riskCaseId);
      if (log.planId) log.plan = plans.get(log.planId);
    }

    const byRun = new Map<string, LogEntrySerialized[]>();
    for (const log of logs) {
      if (!byRun.has(log.runId)) byRun.set(log.runId, []);
      byRun.get(log.runId)!.push(log);
    }
    const runLogs = Array.from(byRun.entries())
      .map(([runId, entries]) => ({ runId, entries }))
      .sort((a, b) => {
        const aFirst = a.entries[0]?.createdAt ?? "";
        const bFirst = b.entries[0]?.createdAt ?? "";
        return bFirst.localeCompare(aFirst);
      });

    return NextResponse.json({ runLogs });
  } catch (err) {
    console.error("GET /api/agents/autonomous/logs error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load logs" },
      { status: 500 }
    );
  }
}

/** DELETE /api/agents/autonomous/logs?runId=xxx — deletes all log entries for that run (clears run from history). */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    if (!runId || !runId.trim()) {
      return NextResponse.json({ error: "Missing runId" }, { status: 400 });
    }

    const result = await db.autonomousAgentLog.deleteMany({
      where: {
        companyId: session.companyId,
        runId: runId.trim(),
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (err) {
    console.error("DELETE /api/agents/autonomous/logs error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete all" },
      { status: 500 }
    );
  }
}
