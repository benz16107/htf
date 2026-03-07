import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isNonRiskNotification } from "@/lib/signal-filters";
import { runSignalRiskAgent } from "@/server/agents/signal-agent";
import { createRiskCaseFromAssessment } from "@/server/risk/create-from-assessment";
import { generateMitigationPlan } from "@/server/agents/mitigation-agent";

const SEVERITY_ORDER = ["MINOR", "MODERATE", "SEVERE", "CRITICAL"] as const;

/** Default lookback (minutes) when config is missing; only process signals within this window. */
const DEFAULT_LOOKBACK_MINUTES = 60;
/** Internal signals: always look back at least this long so ingest-from-Zapier events are picked up. */
const MIN_INTERNAL_LOOKBACK_MINUTES = 60;
/** External signals: minimum lookback so we don't require signals to be only minutes old. */
const MIN_EXTERNAL_LOOKBACK_MINUTES = 60;

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
    const internalSecret = process.env.INTERNAL_API_SECRET;
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

    const signalSources = (config?.signalSources ?? "both").toLowerCase();
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
    const allowedActionTypes = new Set(
      Array.isArray(config?.allowedActionTypesToAutoExecute)
        ? (config.allowedActionTypesToAutoExecute as string[])
        : ["zapier_mcp", "email"]
    );
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

    /** When set (e.g. from ingest "live" trigger), only process these internal event IDs. */
    const liveEventIds = Array.isArray(bodyEventIds) && bodyEventIds.length > 0
      ? bodyEventIds.filter((id): id is string => typeof id === "string")
      : null;

    if (bodyRunId) {
      runId = bodyRunId;
      logRunCompleted = false;
    } else if (bodyContinuous) {
      const startedLog = await db.autonomousAgentLog.findFirst({
        where: { companyId: companyId, actionType: "run_started" },
        orderBy: { createdAt: "desc" },
        select: { runId: true },
      });
      const hasCompleted = startedLog
        ? await db.autonomousAgentLog.findFirst({
            where: { companyId: companyId, runId: startedLog.runId, actionType: "run_completed" },
          })
        : true;
      if (startedLog && !hasCompleted) {
        runId = startedLog.runId;
      } else {
        runId = crypto.randomUUID();
        await logAutonomous(companyId, runId, "run_started", {
          summary: "Run started (continuous)",
          details: { continuous: true },
        });
      }
      logRunCompleted = false;
    } else {
      runId = crypto.randomUUID();
    }

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
        // Pull any unprocessed internal signals (no lookback window) so we never miss ingested events
        events = await db.ingestedEvent.findMany({
          where: { companyId: companyId, autonomousProcessedAt: null },
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
      // Pull any unprocessed external signals (no lookback window) so we never miss saved signals
      const signals = await db.savedExternalSignal.findMany({
        where: { companyId: companyId, autonomousProcessedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      externalJobCount = signals.length;
      for (const s of signals) {
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
        internalLookbackMinutes,
        internalCandidates: internalJobCount,
        externalCandidates: externalJobCount,
      };
      if ((signalSources === "internal_only" || signalSources === "both") && internalJobCount === 0) {
        const unprocessedInternalTotal = await db.ingestedEvent.count({
          where: { companyId: companyId, autonomousProcessedAt: null },
        });
        details.unprocessedInternalTotal = unprocessedInternalTotal;
        if (unprocessedInternalTotal > 0) {
          details.hint = "Internal events exist but are older than lookback window; increase Internal signal lookback in Agent settings.";
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
        });

        const severity =
          (assessment.impact?.severity && String(assessment.impact.severity).toUpperCase()) || "MODERATE";
        const prob = assessment.probability?.pointEstimate ?? 0;
        const revenueAtRisk = assessment.financialImpact?.revenueAtRiskUsd ?? 0;

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
          continue;
        }
        if (executedThisRun >= maxAutoExecutionsPerDay) {
          skipReasons.push("max_auto_executions_per_day_reached");
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
          continue;
        }
        if (
          requireApprovalForRevenueAbove != null &&
          planRevenue > requireApprovalForRevenueAbove
        ) {
          skipReasons.push("revenue_above_approval_threshold");
          continue;
        }
        if (
          requireApprovalForProbabilityAbove != null &&
          planProb > requireApprovalForProbabilityAbove
        ) {
          skipReasons.push("probability_above_approval_threshold");
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
          continue;
        }

        const origin = process.env.NEXTAUTH_URL
          || (typeof req.url === "string" ? new URL(req.url).origin : null)
          || (req.headers.get("x-forwarded-host") ? `https://${req.headers.get("x-forwarded-host")}` : null)
          || "http://localhost:3000";
        const cookie = req.headers.get("cookie") || "";
        const internalSecret = process.env.INTERNAL_API_SECRET;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(cookie && { cookie }),
          ...(internalSecret && {
            "x-internal-secret": internalSecret,
            "x-autonomous-company-id": companyId,
          }),
        };
        const runRes = await fetch(`${origin}/api/agents/mitigation-action/execute`, {
          method: "POST",
          headers,
          body: JSON.stringify({ planId: plan.id }),
        });
        if (runRes.ok) {
          const data = await runRes.json();
          if (data.plan?.status === "EXECUTED") {
            executed++;
            executedThisRun++;
            await logAutonomous(companyId, runId, "plan_executed", {
              riskCaseId: plan.riskCaseId,
              planId: plan.id,
              summary: plan.riskCase?.triggerType?.slice(0, 100) ?? "Plan executed",
            });
            console.log("[autonomous] Plan executed:", plan.id);
          } else if (data.executionResults?.failed?.length > 0) {
            const errMsg = (data.executionResults.failed as { error?: string }[]).map((f) => f.error ?? "").join("; ").slice(0, 200);
            skipReasons.push("execute_failed:" + errMsg);
            console.warn("[autonomous] Execute had failures:", errMsg);
          }
        } else {
          const errText = await runRes.text().catch(() => "");
          let errMessage = errText.slice(0, 150);
          try {
            const errJson = JSON.parse(errText) as { error?: string };
            if (errJson?.error) errMessage = errJson.error.slice(0, 200);
          } catch {
            // use raw slice
          }
          skipReasons.push(`execute_failed:${errMessage}`);
          console.error("[autonomous] Execute HTTP error", runRes.status, errMessage);
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
