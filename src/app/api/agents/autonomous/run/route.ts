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
const DEFAULT_LOOKBACK_MINUTES = 10;

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
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { runId?: string; stop?: boolean; continuous?: boolean; eventIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // no body
    }
    const { runId: bodyRunId, stop: bodyStop, continuous: bodyContinuous, eventIds: bodyEventIds } = body;

    const config = await db.autonomousAgentConfig.findUnique({
      where: { companyId: session.companyId },
    });

    const automationLevel = config?.automationLevel ?? "off";

    if (bodyStop && bodyRunId) {
      await logAutonomous(session.companyId, bodyRunId, "run_completed", {
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
      return NextResponse.json({
        success: true,
        message: "Autonomous agent is off.",
        processed: 0,
        created: 0,
        executed: 0,
      });
    }

    const signalSources = config?.signalSources ?? "both";
    const internalLookbackMinutes = Math.max(1, Math.min(10080, config?.internalSignalLookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES)); // 1 min – 7 days
    const externalLookbackMinutes = Math.max(1, Math.min(10080, config?.externalSignalLookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES));
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
        companyId: session.companyId,
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

    const internalSince = new Date(Date.now() - internalLookbackMinutes * 60 * 1000);
    const externalSince = new Date(Date.now() - externalLookbackMinutes * 60 * 1000);
    /** When set (e.g. from ingest "live" trigger), only process these internal event IDs. */
    const liveEventIds = Array.isArray(bodyEventIds) && bodyEventIds.length > 0
      ? bodyEventIds.filter((id): id is string => typeof id === "string")
      : null;

    if (bodyRunId) {
      runId = bodyRunId;
      logRunCompleted = false;
    } else if (bodyContinuous) {
      const startedLog = await db.autonomousAgentLog.findFirst({
        where: { companyId: session.companyId, actionType: "run_started" },
        orderBy: { createdAt: "desc" },
        select: { runId: true },
      });
      const hasCompleted = startedLog
        ? await db.autonomousAgentLog.findFirst({
            where: { companyId: session.companyId, runId: startedLog.runId, actionType: "run_completed" },
          })
        : true;
      if (startedLog && !hasCompleted) {
        runId = startedLog.runId;
      } else {
        runId = crypto.randomUUID();
        await logAutonomous(session.companyId, runId, "run_started", {
          summary: "Run started (continuous)",
          details: { continuous: true },
        });
      }
      logRunCompleted = false;
    } else {
      runId = crypto.randomUUID();
    }

    if (signalSources === "internal_only" || signalSources === "both") {
      const internalWhere = liveEventIds?.length
        ? { companyId: session.companyId, autonomousProcessedAt: null, id: { in: liveEventIds } }
        : {
            companyId: session.companyId,
            autonomousProcessedAt: null,
            createdAt: { gte: internalSince },
          };
      const events = await db.ingestedEvent.findMany({
        where: internalWhere,
        orderBy: { createdAt: "desc" },
        take: liveEventIds?.length ? liveEventIds.length : 10,
      });
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
      const signals = await db.savedExternalSignal.findMany({
        where: {
          companyId: session.companyId,
          autonomousProcessedAt: null,
          createdAt: { gte: externalSince },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
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

    if (!bodyRunId && !bodyContinuous) {
      await logAutonomous(session.companyId, runId, "run_started", {
        summary: `Run started · ${jobs.length} signal(s) to process`,
        details: { jobCount: jobs.length },
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
          await logAutonomous(session.companyId, runId, "signal_skipped", {
            signalType: job.type,
            signalId: job.id,
            summary: job.triggerType.slice(0, 100),
            details: { reason: "Not risk-relevant (e.g. delivery/bounce notification)" },
          });
          await markProcessed(job, session.companyId);
          processed++;
          continue;
        }

        const agentInput = {
          triggerType: job.triggerType,
          entityMap: job.entityMap,
          timeWindow: job.timeWindow,
          assumptions: [] as string[],
        };

        const assessment = await runSignalRiskAgent(session.companyId, agentInput, {
          createRiskCase: false,
        });

        const severity =
          (assessment.impact?.severity && String(assessment.impact.severity).toUpperCase()) || "MODERATE";
        const prob = assessment.probability?.pointEstimate ?? 0;
        const revenueAtRisk = assessment.financialImpact?.revenueAtRiskUsd ?? 0;

        if (automationLevel === "assess_only") {
          await logAutonomous(session.companyId, runId, "signal_assessed", {
            signalType: job.type,
            signalId: job.id,
            summary: job.triggerType.slice(0, 100),
            details: { severity, probability: prob, revenueAtRisk },
          });
          try {
            await db.assessmentArchive.create({
              data: {
                companyId: session.companyId,
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
          await markProcessed(job, session.companyId);
          processed++;
          continue;
        }

        const { riskCaseId } = await createRiskCaseFromAssessment(
          session.companyId,
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
              companyId: session.companyId,
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
        await logAutonomous(session.companyId, runId, "risk_case_created", {
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
          await markProcessed(job, session.companyId);
          processed++;
          continue;
        }

        const draftResult = await generateMitigationPlan(session.companyId, riskCaseId, scenario.id, {
          createdByAutonomousAgent: true,
        });
        const draftedPlanId = (draftResult as { planId?: string }).planId ?? null;
        if (draftedPlanId) {
          await logAutonomous(session.companyId, runId, "plan_drafted", {
            signalType: job.type,
            signalId: job.id,
            riskCaseId,
            planId: draftedPlanId,
            summary: job.triggerType.slice(0, 100),
          });
        }
        await markProcessed(job, session.companyId);
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
            companyId: session.companyId,
            createdAt: { gte: todayStart },
          },
        });
        if (plansCreatedTodayNow <= requireApprovalForFirstNPerDay) {
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
            "x-autonomous-company-id": session.companyId,
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
            await logAutonomous(session.companyId, runId, "plan_executed", {
              riskCaseId: plan.riskCaseId,
              planId: plan.id,
              summary: plan.riskCase?.triggerType?.slice(0, 100) ?? "Plan executed",
            });
          } else if (data.executionResults?.failed?.length > 0) {
            skipReasons.push("execute_failed:" + (data.executionResults.failed as { error?: string }[]).map((f) => f.error ?? "").join("; ").slice(0, 200));
          }
        } else {
          const errText = await runRes.text().catch(() => "");
          skipReasons.push(`execute_http_${runRes.status}:${errText.slice(0, 150)}`);
          console.error("Autonomous run: execute returned", runRes.status, errText.slice(0, 500));
        }
      } catch (err) {
        console.error("Autonomous run item error:", err);
      }
    }

    if (logRunCompleted) {
      await logAutonomous(session.companyId, runId, "run_completed", {
        summary: `Processed ${processed}, created ${created} risk cases, executed ${executed} plans`,
        details: { processed, created, executed },
      });
    }

    return NextResponse.json({
      success: true,
      runId,
      processed,
      created,
      executed,
      ...(skipReasons.length > 0 && { skipReasons: [...new Set(skipReasons)] }),
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
