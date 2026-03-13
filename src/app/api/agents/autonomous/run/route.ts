import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRequestOrigin } from "@/lib/request-origin";
import { isNonRiskNotification } from "@/lib/signal-filters";
import { runSignalRiskAgent } from "@/server/agents/signal-agent";
import { createRiskCaseFromAssessment } from "@/server/risk/create-from-assessment";
import { generateMitigationPlan } from "@/server/agents/mitigation-agent";
import { executeMitigationPlan } from "@/server/agents/execute-mitigation-plan";

const SEVERITY_ORDER = ["MINOR", "MODERATE", "SEVERE", "CRITICAL"] as const;

/** Default lookback (minutes) when config is missing; only process signals within this window. */
const DEFAULT_LOOKBACK_MINUTES = 60;
/** Internal signals: always look back at least this long so ingest-from-Zapier events are picked up. */
const MIN_INTERNAL_LOOKBACK_MINUTES = 60;
/** External signals: minimum lookback so we don't require signals to be only minutes old. */
const MIN_EXTERNAL_LOOKBACK_MINUTES = 60;

function normalizeSignalSources(value: string | null | undefined): "internal_only" | "external_only" | "both" {
  const v = (value ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  if (v === "internal_only" || v === "internal") return "internal_only";
  if (v === "external_only" || v === "external") return "external_only";
  return "both";
}

function normalizeInternalMode(value: string | null | undefined): "live" | "lookback" {
  const v = (value ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  return v === "live" ? "live" : "lookback";
}

function getInternalRunSecret(): string | null {
  return (
    process.env.INTERNAL_API_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.ZAPIER_MCP_EMBED_SECRET?.trim() ||
    null
  );
}

function signalSourcesFromRunDetails(details: unknown): "internal_only" | "external_only" | "both" | null {
  if (!details || typeof details !== "object") return null;
  return normalizeSignalSources((details as { signalSources?: string | null }).signalSources ?? null);
}

function normalizeUrlForDedup(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, "").toLowerCase();
    const kept = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      const key = k.toLowerCase();
      if (key.startsWith("utm_")) continue;
      if (key === "gclid" || key === "fbclid" || key === "mc_cid" || key === "mc_eid" || key === "ref" || key === "source") continue;
      kept.set(k, v);
    }
    const query = kept.toString();
    return `${host}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

function normalizeTitleForDedup(title?: string | null): string {
  return (title || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function externalSignalFingerprint(signal: { title?: string | null; url?: string | null; source?: string | null }): string {
  const url = normalizeUrlForDedup(signal.url);
  if (url) return `url:${url}`;
  return `title:${normalizeTitleForDedup(signal.title)}|source:${(signal.source ?? "").toLowerCase().trim()}`;
}

async function logAutonomous(
  companyId: string,
  runId: string,
  actionType: string,
  opts: {
    signalType?: "internal" | "external";
    signalId?: string;
    riskCaseId?: string;
    planId?: string;
    summary?: string;
    details?: Record<string, unknown>;
  } = {}
) {
  try {
    if (typeof (db as { autonomousAgentLog?: { create: (args: object) => Promise<unknown> } }).autonomousAgentLog?.create !== "function") return;
    await db.autonomousAgentLog.create({
      data: {
        companyId,
        runId,
        actionType,
        signalType: opts.signalType ?? null,
        signalId: opts.signalId ?? null,
        riskCaseId: opts.riskCaseId ?? null,
        planId: opts.planId ?? null,
        summary: opts.summary ?? null,
        details: opts.details == null ? Prisma.JsonNull : (opts.details as Prisma.InputJsonValue),
      },
    });
  } catch {
    // Logging may fail if Prisma client is stale (run `npx prisma generate` and restart)
  }
}

async function logPlanExecutionDeferred(
  companyId: string,
  runId: string,
  opts: {
    signalType?: "internal" | "external";
    signalId?: string;
    riskCaseId: string;
    planId: string;
    summary: string;
    details?: Record<string, unknown>;
  }
) {
  await logAutonomous(companyId, runId, "plan_execution_deferred", opts);
}

async function tryClaimJob(
  job: { type: "internal" | "external"; id: string },
  companyId: string
): Promise<boolean> {
  const claimedAt = new Date();
  if (job.type === "internal") {
    const result = await db.ingestedEvent.updateMany({
      where: { id: job.id, companyId, autonomousProcessedAt: null },
      data: { autonomousProcessedAt: claimedAt },
    });
    return result.count > 0;
  }
  const result = await db.savedExternalSignal.updateMany({
    where: { id: job.id, companyId, autonomousProcessedAt: null },
    data: { autonomousProcessedAt: claimedAt },
  });
  return result.count > 0;
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function severityAtOrAbove(severity: string, min: string): boolean {
  const a = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  const b = SEVERITY_ORDER.indexOf(min as (typeof SEVERITY_ORDER)[number]);
  if (a < 0 || b < 0) return false;
  return a >= b;
}

function severityAtOrAboveStrict(severity: string, threshold: string): boolean {
  const a = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  const b = SEVERITY_ORDER.indexOf(threshold as (typeof SEVERITY_ORDER)[number]);
  if (a < 0 || b < 0) return false;
  return a >= b;
}

/**
 * POST /api/agents/autonomous/run
 * Runs the autonomous pipeline: process unprocessed signals, assess, create case, draft plan, optionally execute.
 * Body: { runId?, stop?, continuous? }. If continuous or runId: one logical "run" (no extra run_started/run_completed per tick).
 * Only processes signals created after the run started (for continuous runs) or in last 24h (one-off).
 */
export async function POST(req: Request) {
  try {
    let body: { runId?: string; stop?: boolean; continuous?: boolean; eventIds?: string[]; companyId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // no body
    }

    const cronSecret = process.env.CRON_SECRET;
    const internalSecret = getInternalRunSecret();
    const isCronTrigger = Boolean(cronSecret && req.headers.get("x-cron-secret") === cronSecret && body.companyId);
    const isInternalTrigger = Boolean(
      internalSecret &&
      req.headers.get("x-internal-secret") === internalSecret &&
      body.companyId &&
      typeof body.companyId === "string"
    );
    const session = await getSession();
    const companyId = isCronTrigger || isInternalTrigger
      ? body.companyId!
      : session?.companyId ?? null;
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId: bodyRunId, stop: bodyStop, continuous: bodyContinuous, eventIds: bodyEventIds } = body;

    const config = await db.autonomousAgentConfig.findUnique({
      where: { companyId },
    });

    // If agent is "running" but level is off (e.g. toggled on from logs page without setting level), process as full_auto
    const automationLevel =
      config?.automationLevel === "off" && config?.agentRunning === true
        ? "full_auto"
        : (config?.automationLevel ?? "off");

    if (!config && !isCronTrigger && !isInternalTrigger) {
      console.log("[autonomous] No config for company – turn the agent on from the Autonomous agent page to create config.");
    }

    if (bodyStop && bodyRunId) {
      await logAutonomous(companyId, bodyRunId, "run_completed", {
        summary: "Run stopped",
        details: { stopped: true },
      });
      return NextResponse.json({
        success: true,
        runId: bodyRunId,
        message: "Run stopped",
        processed: 0,
        created: 0,
        executed: 0,
      });
    }

    // Master safety switch: autonomous processing must not run when agentRunning is off.
    if (!config?.agentRunning) {
      console.log("[autonomous] Run skipped: agentRunning is off");
      return NextResponse.json({
        success: true,
        message: "Autonomous agent is off.",
        processed: 0,
        created: 0,
        executed: 0,
      });
    }

    if (automationLevel === "off") {
      console.log("[autonomous] Run skipped: automationLevel is off");
      return NextResponse.json({
        success: true,
        message: "Autonomous agent is off.",
        processed: 0,
        created: 0,
        executed: 0,
      });
    }

    const signalSources = normalizeSignalSources(config?.signalSources);
    const internalSignalMode = normalizeInternalMode((config as { internalSignalMode?: string } | null)?.internalSignalMode);
    const rawInternalLookback = config?.internalSignalLookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
    const internalLookbackMinutes = Math.max(
      MIN_INTERNAL_LOOKBACK_MINUTES,
      Math.min(10080, Math.max(1, rawInternalLookback))
    ); // at least 60 min so internal (ingest) events are usually in window
    const externalLookbackMinutes = Math.max(
      MIN_EXTERNAL_LOOKBACK_MINUTES,
      Math.min(10080, config?.externalSignalLookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES)
    );
    const minSeverityToAct = config?.minSeverityToAct ?? "MODERATE";
    const minProbabilityToAct = (config?.minProbabilityToAct ?? 0) / 100;
    const minRevenueAtRiskToAct = config?.minRevenueAtRiskToAct ?? 0;
    const requireApprovalForSeverity = config?.requireApprovalForSeverity ?? null;
    const requireApprovalForRevenueAbove = config?.requireApprovalForRevenueAbove ?? null;
    const requireApprovalForProbabilityAbove = config?.requireApprovalForProbabilityAbove != null
      ? config.requireApprovalForProbabilityAbove / 100
      : null;
    const maxAutoExecutionsPerDay = config?.maxAutoExecutionsPerDay ?? 5;
    const configuredAllowedActionTypes = Array.isArray(config?.allowedActionTypesToAutoExecute)
      ? (config.allowedActionTypesToAutoExecute as string[])
      : null;
    const allowedActionTypes = new Set(
      (configuredAllowedActionTypes && configuredAllowedActionTypes.length > 0)
        ? configuredAllowedActionTypes
        : ["zapier_mcp", "email", "notification", "zapier_action", "erp_update", "financial_report"]
    );
    // Compatibility bridge for older configs: zapier_action and zapier_mcp are interchangeable execution paths.
    if (allowedActionTypes.has("zapier_mcp")) allowedActionTypes.add("zapier_action");
    if (allowedActionTypes.has("zapier_action")) allowedActionTypes.add("zapier_mcp");
    const requireApprovalForFirstNPerDay = config?.requireApprovalForFirstNPerDay ?? 0;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const executedToday = await db.mitigationPlan.count({
      where: {
        companyId: companyId,
        status: "EXECUTED",
        updatedAt: { gte: todayStart },
      },
    });

    type SignalJob = {
        type: "internal";
        id: string;
        triggerType: string;
        entityMap: Record<string, string>;
        timeWindow: { startDate: string; expectedDurationDays: number };
      }
      | {
        type: "external";
        id: string;
        triggerType: string;
        entityMap: Record<string, string>;
        timeWindow: { startDate: string; expectedDurationDays: number };
      };

    const jobs: SignalJob[] = [];

    let runId: string;
    let logRunCompleted = true;
    let activeRunStartedAt: Date | null = null;

    /** When set (e.g. from ingest "live" trigger), only process these internal event IDs. */
    const liveEventIds = Array.isArray(bodyEventIds) && bodyEventIds.length > 0
      ? bodyEventIds.filter((id): id is string => typeof id === "string")
      : null;

    // Pull fresh internal signals before selecting jobs when this run is not already tied to
    // explicit live event ids. This keeps the continuous UI run loop aligned with "Sync now".
    if (!liveEventIds && (signalSources === "internal_only" || signalSources === "both")) {
      try {
        const origin = getRequestOrigin(req);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const cronHeader = req.headers.get("x-cron-secret");
        const internalHeader = req.headers.get("x-internal-secret");
        if (cronHeader) headers["x-cron-secret"] = cronHeader;
        if (internalHeader) headers["x-internal-secret"] = internalHeader;
        const cookieHeader = req.headers.get("cookie");
        if (cookieHeader) headers.Cookie = cookieHeader;

        const ingestBody: Record<string, unknown> = {
          suppressAutonomousTrigger: true,
        };
        if (isCronTrigger || isInternalTrigger) ingestBody.companyId = companyId;
        if (internalSignalMode === "lookback") {
          ingestBody.receivedAfter = new Date(Date.now() - internalLookbackMinutes * 60 * 1000).toISOString();
        }

        const ingestRes = await fetch(`${origin}/api/risk/ingest`, {
          method: "POST",
          headers,
          body: JSON.stringify(ingestBody),
          cache: "no-store",
        });
        if (!ingestRes.ok) {
          const text = await ingestRes.text().catch(() => "");
          console.warn(
            "[autonomous] Internal ingest prefetch failed company=%s status=%d body=%s",
            companyId,
            ingestRes.status,
            text.slice(0, 200)
          );
        }
      } catch (ingestErr) {
        console.warn("[autonomous] Internal ingest prefetch error:", ingestErr);
      }
    }

    if (bodyRunId) {
      const existingRunStart = await db.autonomousAgentLog.findFirst({
        where: { companyId: companyId, runId: bodyRunId, actionType: "run_started" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, details: true },
      });
      const startedSignalSources = signalSourcesFromRunDetails(existingRunStart?.details);
      const sourcePolicyChanged =
        startedSignalSources == null || startedSignalSources !== signalSources;
      if (sourcePolicyChanged) {
        await logAutonomous(companyId, bodyRunId, "run_completed", {
          summary: "Run restarted after signal source policy changed",
          details: {
            restarted: true,
            previousSignalSources: startedSignalSources,
            nextSignalSources: signalSources,
          },
        });
        runId = crypto.randomUUID();
        activeRunStartedAt = new Date();
        await logAutonomous(companyId, runId, "run_started", {
          summary: "Run started (continuous)",
          details: { continuous: true, signalSources },
        });
      } else {
        runId = bodyRunId;
        activeRunStartedAt = existingRunStart?.createdAt ?? null;
      }
      // Even for continuous ticks, write run_completed snapshots so Overview can display latest run stats.
      logRunCompleted = true;
    } else if (bodyContinuous) {
      const startedLog = await db.autonomousAgentLog.findFirst({
        where: { companyId: companyId, actionType: "run_started" },
        orderBy: { createdAt: "desc" },
        select: { runId: true, createdAt: true, details: true },
      });
      const hasCompleted = startedLog
        ? await db.autonomousAgentLog.findFirst({
            where: { companyId: companyId, runId: startedLog.runId, actionType: "run_completed" },
          })
        : true;
      const startedSignalSources = signalSourcesFromRunDetails(startedLog?.details);
      const sourcePolicyChanged =
        startedSignalSources == null || startedSignalSources !== signalSources;
      if (startedLog && !hasCompleted && !sourcePolicyChanged) {
        runId = startedLog.runId;
        activeRunStartedAt = startedLog.createdAt;
      } else {
        if (startedLog && !hasCompleted && sourcePolicyChanged) {
          await logAutonomous(companyId, startedLog.runId, "run_completed", {
            summary: "Run restarted after signal source policy changed",
            details: {
              restarted: true,
              previousSignalSources: startedSignalSources,
              nextSignalSources: signalSources,
            },
          });
        }
        runId = crypto.randomUUID();
        activeRunStartedAt = new Date();
        await logAutonomous(companyId, runId, "run_started", {
          summary: "Run started (continuous)",
          details: { continuous: true, signalSources },
        });
      }
      // Even for continuous ticks, write run_completed snapshots so Overview can display latest run stats.
      logRunCompleted = true;
    } else {
      runId = crypto.randomUUID();
    }

    const internalCreatedAfter =
      activeRunStartedAt ?? minutesAgo(internalLookbackMinutes);
    const externalCreatedAfter =
      activeRunStartedAt ?? minutesAgo(externalLookbackMinutes);

    let internalJobCount = 0;
    let externalJobCount = 0;
    if (signalSources === "internal_only" || signalSources === "both") {
      let events: Awaited<ReturnType<typeof db.ingestedEvent.findMany>>;
      if (liveEventIds?.length) {
        events = await db.ingestedEvent.findMany({
          where: { companyId: companyId, autonomousProcessedAt: null, id: { in: liveEventIds } },
          orderBy: { createdAt: "desc" },
          take: liveEventIds.length,
        });
      } else {
        // Only process new internal signals inside the active run window / lookback window.
        events = await db.ingestedEvent.findMany({
          where: {
            companyId: companyId,
            autonomousProcessedAt: null,
            createdAt: { gte: internalCreatedAfter },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
      }
      internalJobCount = events.length;
      for (const e of events) {
        const startDate = e.createdAt.toISOString().split("T")[0];
        jobs.push({
          type: "internal",
          id: e.id,
          triggerType: (e.signalSummary || "").slice(0, 120) || `Internal: ${e.toolName}`,
          entityMap: {
            eventId: e.id,
            source: e.source,
            toolName: e.toolName,
            signal: e.signalSummary || "",
          },
          timeWindow: { startDate, expectedDurationDays: 7 },
        });
      }
    }

    if (signalSources === "external_only" || signalSources === "both") {
      // Only process new external signals inside the active run window / lookback window.
      const signals = await db.savedExternalSignal.findMany({
        where: {
          companyId: companyId,
          autonomousProcessedAt: null,
          createdAt: { gte: externalCreatedAfter },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const processedExternal = await db.savedExternalSignal.findMany({
        where: {
          companyId: companyId,
          autonomousProcessedAt: { not: null },
          createdAt: { gte: minutesAgo(60 * 24 * 60) },
        },
        select: { title: true, url: true, source: true },
        take: 500,
      });
      const seenFingerprints = new Set(processedExternal.map((s) => externalSignalFingerprint(s)));
      const duplicateSignalIds: string[] = [];
      for (const s of signals) {
        const fingerprint = externalSignalFingerprint(s);
        if (seenFingerprints.has(fingerprint)) {
          duplicateSignalIds.push(s.id);
          continue;
        }
        seenFingerprints.add(fingerprint);
        const startDate = s.createdAt.toISOString().split("T")[0];
        jobs.push({
          type: "external",
          id: s.id,
          triggerType: s.title.slice(0, 120),
          entityMap: {
            signalId: s.id,
            title: s.title,
            snippet: s.snippet,
            url: s.url || "",
            source: s.source || "",
          },
          timeWindow: { startDate, expectedDurationDays: 7 },
        });
      }
      externalJobCount = jobs.filter((j) => j.type === "external").length;
      if (duplicateSignalIds.length > 0) {
        const now = new Date();
        await db.savedExternalSignal.updateMany({
          where: { companyId, id: { in: duplicateSignalIds } },
          data: { autonomousProcessedAt: now },
        });
      }
    }

    console.log(
      "[autonomous] Run: automationLevel=%s jobs=%d (internal=%d external=%d)",
      automationLevel,
      jobs.length,
      internalJobCount,
      externalJobCount
    );

    if (!bodyRunId && !bodyContinuous) {
      const details: Record<string, unknown> = {
        jobCount: jobs.length,
        signalSources,
        internalLookbackMinutes,
        externalLookbackMinutes,
        internalCandidates: internalJobCount,
        externalCandidates: externalJobCount,
        internalCreatedAfter: internalCreatedAfter.toISOString(),
        externalCreatedAfter: externalCreatedAfter.toISOString(),
      };
      if ((signalSources === "internal_only" || signalSources === "both") && internalJobCount === 0) {
        const unprocessedInternalTotal = await db.ingestedEvent.count({
          where: { companyId: companyId, autonomousProcessedAt: null },
        });
        const staleUnprocessedInternalTotal = await db.ingestedEvent.count({
          where: {
            companyId: companyId,
            autonomousProcessedAt: null,
            createdAt: { lt: internalCreatedAfter },
          },
        });
        details.unprocessedInternalTotal = unprocessedInternalTotal;
        details.staleUnprocessedInternalTotal = staleUnprocessedInternalTotal;
        if (staleUnprocessedInternalTotal > 0) {
          details.hint = "Older internal events exist, but the autonomous agent only processes new signals inside the active window.";
        } else if (unprocessedInternalTotal > 0) {
          details.hint = "Internal events exist but are outside the current active window.";
        } else {
          details.hint = "Run Sync from Zapier on Signals & risk to ingest internal signals.";
        }
      }
      await logAutonomous(companyId, runId, "run_started", {
        summary: `Run started · ${jobs.length} signal(s) to process`,
        details,
      });
    }

    let processed = 0;
    let created = 0;
    let executed = 0;
    let executedThisRun = executedToday;
    const skipReasons: string[] = [];

    for (const job of jobs) {
      try {
        const claimed = await tryClaimJob(job, companyId);
        if (!claimed) {
          // Another overlapping run already claimed/processed this signal.
          continue;
        }

        const triggerText = [job.triggerType, job.entityMap?.signal, job.entityMap?.title, job.entityMap?.snippet]
          .filter(Boolean)
          .join(" ");
        if (isNonRiskNotification(triggerText)) {
          await logAutonomous(companyId, runId, "signal_skipped", {
            signalType: job.type,
            signalId: job.id,
            summary: job.triggerType.slice(0, 100),
            details: { reason: "Not risk-relevant (e.g. delivery/bounce notification)" },
          });
          await markProcessed(job, companyId);
          processed++;
          continue;
        }

        const agentInput = {
          triggerType: job.triggerType,
          entityMap: job.entityMap,
          timeWindow: job.timeWindow,
          assumptions: [] as string[],
        };

        const assessment = await runSignalRiskAgent(companyId, agentInput, {
          createRiskCase: false,
          // Respect the autonomous source policy: internal-only runs should not
          // enrich the assessment with broad live context that may include
          // external/news-like sources from input-context tools.
          includeLiveContext: signalSources !== "internal_only",
        });

        const severity =
          (assessment.impact?.severity && String(assessment.impact.severity).toUpperCase()) || "MODERATE";
        const prob = assessment.probability?.pointEstimate ?? 0;
        const revenueAtRisk = assessment.financialImpact?.revenueAtRiskUsd ?? 0;

        if (
          !severityAtOrAbove(severity, minSeverityToAct) ||
          prob < minProbabilityToAct ||
          revenueAtRisk < minRevenueAtRiskToAct
        ) {
          skipReasons.push("below_action_threshold");
          await logAutonomous(companyId, runId, "signal_skipped", {
            signalType: job.type,
            signalId: job.id,
            summary: job.triggerType.slice(0, 100),
            details: {
              reason: "Below autonomous action thresholds",
              severity,
              probability: prob,
              revenueAtRisk,
              minSeverityToAct,
              minProbabilityToAct,
              minRevenueAtRiskToAct,
            },
          });
          await markProcessed(job, companyId);
          processed++;
          continue;
        }

        if (automationLevel === "assess_only") {
          await logAutonomous(companyId, runId, "signal_assessed", {
            signalType: job.type,
            signalId: job.id,
            summary: job.triggerType.slice(0, 100),
            details: { severity, probability: prob, revenueAtRisk },
          });
          try {
            await db.assessmentArchive.create({
              data: {
                companyId: companyId,
                triggerType: job.triggerType,
                issueTitle: job.triggerType,
                entityMap: job.entityMap,
                timeWindow: job.timeWindow,
                assumptions: [],
                assessment: assessment as object,
                source: "autonomous",
              },
            });
          } catch (archiveErr) {
            console.error("Autonomous run (assess_only): failed to add assessment to archive:", archiveErr);
          }
          await markProcessed(job, companyId);
          processed++;
          continue;
        }

        const { riskCaseId } = await createRiskCaseFromAssessment(
          companyId,
          {
            triggerType: job.triggerType,
            entityMap: job.entityMap,
            timeWindow: job.timeWindow,
            assumptions: [],
            riskAssessment: assessment,
            issueTitle: job.triggerType,
          },
          { autonomous: true }
        );
        created++;
        try {
          await db.assessmentArchive.create({
            data: {
              companyId: companyId,
              triggerType: job.triggerType,
              issueTitle: job.triggerType,
              entityMap: job.entityMap,
              timeWindow: job.timeWindow,
              assumptions: [],
              assessment: assessment as object,
              source: "autonomous",
            },
          });
        } catch (archiveErr) {
          console.error("Autonomous run: failed to add assessment to archive:", archiveErr);
        }
        await logAutonomous(companyId, runId, "risk_case_created", {
          signalType: job.type,
          signalId: job.id,
          riskCaseId,
          summary: job.triggerType.slice(0, 100),
          details: { severity, probability: prob, revenueAtRisk },
        });

        const recommended = await db.scenario.findFirst({
          where: { riskCaseId, recommendation: "RECOMMENDED" },
        });
        const scenario = recommended ?? (await db.scenario.findFirst({ where: { riskCaseId } }));
        if (!scenario) {
          await markProcessed(job, companyId);
          processed++;
          continue;
        }

        const draftResult = await generateMitigationPlan(companyId, riskCaseId, scenario.id, {
          createdByAutonomousAgent: true,
          executionModeOverride: automationLevel === "full_auto" ? "autonomous" : "human_in_loop",
        });
        const draftedPlanId = (draftResult as { planId?: string }).planId ?? null;
        if (draftedPlanId) {
          await logAutonomous(companyId, runId, "plan_drafted", {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: draftedPlanId,
            summary: job.triggerType.slice(0, 100),
          });
        }
        await markProcessed(job, companyId);
        processed++;

        if (automationLevel === "draft_only") {
          skipReasons.push("automation_level_draft_only");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: draftedPlanId ?? draftResult.plan.id,
            summary: "Execution not attempted because automation level is Draft only.",
            details: {
              category: "automation_level",
              automationLevel,
            },
          });
          continue;
        }
        if (executedThisRun >= maxAutoExecutionsPerDay) {
          skipReasons.push("max_auto_executions_per_day_reached");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: draftedPlanId ?? draftResult.plan.id,
            summary: `Execution paused because today's auto-execution limit (${maxAutoExecutionsPerDay}) was reached.`,
            details: {
              category: "daily_limit",
              executedToday: executedThisRun,
              maxAutoExecutionsPerDay,
            },
          });
          continue;
        }

        const plansCreatedTodayNow = await db.mitigationPlan.count({
          where: {
            companyId: companyId,
            createdAt: { gte: todayStart },
          },
        });
        // When requireApprovalForFirstNPerDay > 0, the first N plans of the day need approval (no auto-execute).
        if (requireApprovalForFirstNPerDay > 0 && plansCreatedTodayNow <= requireApprovalForFirstNPerDay) {
          skipReasons.push("within_first_n_requiring_approval");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: draftedPlanId ?? draftResult.plan.id,
            summary: `Waiting for approval because this is plan ${plansCreatedTodayNow} today and the first ${requireApprovalForFirstNPerDay} plan(s) require review.`,
            details: {
              category: "approval_threshold",
              reason: "within_first_n_requiring_approval",
              planNumberToday: plansCreatedTodayNow,
              requireApprovalForFirstNPerDay,
            },
          });
          continue;
        }

        const plan = await db.mitigationPlan.findFirst({
          where: { riskCaseId },
          orderBy: { createdAt: "desc" },
          include: { riskCase: true },
        });
        if (!plan || plan.status !== "DRAFTED") {
          if (!plan) skipReasons.push("no_plan");
          else if (plan.status !== "DRAFTED") skipReasons.push("plan_not_drafted");
          continue;
        }

        const rc = plan.riskCase;
        const planSeverity = (rc.severity || "MODERATE") as string;
        const planProb = (rc.probabilityPoint ?? 0) as number;
        const planRevenue = (rc.financialImpact as { revenueAtRiskUsd?: number } | null)?.revenueAtRiskUsd ?? 0;

        if (
          requireApprovalForSeverity &&
          severityAtOrAboveStrict(planSeverity, requireApprovalForSeverity)
        ) {
          skipReasons.push("severity_requires_approval");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: plan.id,
            summary: `Waiting for approval because severity ${planSeverity} is at or above the approval threshold (${requireApprovalForSeverity}).`,
            details: {
              category: "approval_threshold",
              reason: "severity_requires_approval",
              actualSeverity: planSeverity,
              thresholdSeverity: requireApprovalForSeverity,
            },
          });
          continue;
        }
        if (
          requireApprovalForRevenueAbove != null &&
          planRevenue > requireApprovalForRevenueAbove
        ) {
          skipReasons.push("revenue_above_approval_threshold");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: plan.id,
            summary: `Waiting for approval because revenue at risk ($${planRevenue.toLocaleString()}) is above the approval threshold ($${requireApprovalForRevenueAbove.toLocaleString()}).`,
            details: {
              category: "approval_threshold",
              reason: "revenue_above_approval_threshold",
              actualRevenueAtRisk: planRevenue,
              thresholdRevenueAtRisk: requireApprovalForRevenueAbove,
            },
          });
          continue;
        }
        if (
          requireApprovalForProbabilityAbove != null &&
          planProb > requireApprovalForProbabilityAbove
        ) {
          skipReasons.push("probability_above_approval_threshold");
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: plan.id,
            summary: `Waiting for approval because probability ${(planProb * 100).toFixed(1)}% is above the approval threshold ${(requireApprovalForProbabilityAbove * 100).toFixed(1)}%.`,
            details: {
              category: "approval_threshold",
              reason: "probability_above_approval_threshold",
              actualProbabilityPercent: Number((planProb * 100).toFixed(1)),
              thresholdProbabilityPercent: Number((requireApprovalForProbabilityAbove * 100).toFixed(1)),
            },
          });
          continue;
        }

        const actions = (plan.actions as { type?: string }[]) || [];
        const disallowedTypes = [...new Set(
          actions
            .filter((a) => a.type && a.type !== "insight" && a.type !== "recommendation" && !allowedActionTypes.has(a.type))
            .map((a) => a.type)
        )];
        if (disallowedTypes.length > 0) {
          skipReasons.push(`disallowed_action_types:${disallowedTypes.join(",")}`);
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: plan.id,
            summary: `Execution paused because this draft includes action types not allowed for auto-execute: ${disallowedTypes.join(", ")}.`,
            details: {
              category: "action_type_policy",
              disallowedTypes,
              allowedActionTypes: [...allowedActionTypes],
            },
          });
          continue;
        }

        const result = await executeMitigationPlan({
          companyId,
          planId: plan.id,
          executionSource: "autonomous",
        });
        if (result.plan?.status === "EXECUTED") {
          executed++;
          executedThisRun++;
          await logAutonomous(companyId, runId, "plan_executed", {
            riskCaseId: plan.riskCaseId,
            planId: plan.id,
            summary: plan.riskCase?.triggerType?.slice(0, 100) ?? "Plan executed",
          });
          console.log("[autonomous] Plan executed:", plan.id);
        } else if ((result.executionResults?.failed.length ?? 0) > 0) {
          const errMsg = (result.executionResults?.failed ?? []).map((f) => f.error ?? "").join("; ").slice(0, 200);
          skipReasons.push("execute_failed:" + errMsg);
          await logPlanExecutionDeferred(companyId, runId, {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: plan.id,
            summary: `Execution started but failed for one or more actions: ${errMsg}`,
            details: {
              category: "execution_failed",
              failures: result.executionResults?.failed ?? [],
            },
          });
          console.warn("[autonomous] Execute had failures:", errMsg);
        }
      } catch (err) {
        console.error("Autonomous run item error:", err);
      }
    }

    if (logRunCompleted) {
      await logAutonomous(companyId, runId, "run_completed", {
        summary: `Processed ${processed}, created ${created} risk cases, executed ${executed} plans`,
        details: {
          processed,
          created,
          executed,
          internalCandidates: internalJobCount,
          externalCandidates: externalJobCount,
          skipReasonsCount: skipReasons.length,
        },
      });
    }

    const uniqueSkipReasons = [...new Set(skipReasons)];
    if (uniqueSkipReasons.length > 0) {
      console.log("[autonomous] Skip reasons:", uniqueSkipReasons.join(" | "));
    }
    console.log("[autonomous] Done: processed=%d created=%d executed=%d", processed, created, executed);

    return NextResponse.json({
      success: true,
      runId,
      processed,
      created,
      executed,
      internalCandidates: internalJobCount,
      externalCandidates: externalJobCount,
      internalLookbackMinutes,
      ...(uniqueSkipReasons.length > 0 && { skipReasons: uniqueSkipReasons }),
    });
  } catch (err) {
    console.error("Autonomous run error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Autonomous run failed" },
      { status: 500 }
    );
  }
}

async function markProcessed(
  job: { type: "internal" | "external"; id: string },
  companyId: string
) {
  const now = new Date();
  if (job.type === "internal") {
    await db.ingestedEvent.update({
      where: { id: job.id, companyId },
      data: { autonomousProcessedAt: now },
    });
  } else {
    await db.savedExternalSignal.update({
      where: { id: job.id, companyId },
      data: { autonomousProcessedAt: now },
    });
  }
}
