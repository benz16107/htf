import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const DEFAULTS = {
  agentRunning: false,
  automationLevel: "off",
  signalSources: "both",
  internalSignalMode: "lookback" as const,
  internalSignalLookbackMinutes: 60,
  externalSignalLookbackMinutes: 60,
  minSeverityToAct: "MODERATE",
  minProbabilityToAct: 0,
  minRevenueAtRiskToAct: null as number | null,
  /** null = no severity-based approval; with full_auto, plans can execute regardless of severity */
  requireApprovalForSeverity: null as string | null,
  requireApprovalForRevenueAbove: null as number | null,
  requireApprovalForProbabilityAbove: null as number | null,
  maxAutoExecutionsPerDay: 5,
  /** Include all action types the mitigation agent can produce so plans are not skipped for "disallowed" type */
  allowedActionTypesToAutoExecute: ["zapier_mcp", "email", "notification", "zapier_action", "erp_update"] as string[],
  requireApprovalForFirstNPerDay: 0,
};

export type AutonomousConfigPayload = typeof DEFAULTS;

/** GET /api/settings/autonomous — returns current company's autonomous agent config. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await db.autonomousAgentConfig.findUnique({
      where: { companyId: session.companyId },
    });

    if (!config) {
      return NextResponse.json({
        config: {
          ...DEFAULTS,
          id: null,
          companyId: session.companyId,
          agentRunning: false,
          internalSignalMode: DEFAULTS.internalSignalMode,
          internalSignalLookbackMinutes: DEFAULTS.internalSignalLookbackMinutes,
          externalSignalLookbackMinutes: DEFAULTS.externalSignalLookbackMinutes,
          createdAt: null,
          updatedAt: null,
        },
      });
    }

    const allowed =
      config.allowedActionTypesToAutoExecute != null &&
      Array.isArray(config.allowedActionTypesToAutoExecute)
        ? (config.allowedActionTypesToAutoExecute as string[])
        : DEFAULTS.allowedActionTypesToAutoExecute;

    return NextResponse.json({
      config: {
        id: config.id,
        companyId: config.companyId,
        agentRunning: config.agentRunning ?? false,
        automationLevel: config.automationLevel,
        signalSources: config.signalSources,
        internalSignalMode: (config as { internalSignalMode?: string }).internalSignalMode ?? DEFAULTS.internalSignalMode,
        internalSignalLookbackMinutes: config.internalSignalLookbackMinutes ?? DEFAULTS.internalSignalLookbackMinutes,
        externalSignalLookbackMinutes: config.externalSignalLookbackMinutes ?? DEFAULTS.externalSignalLookbackMinutes,
        minSeverityToAct: config.minSeverityToAct,
        minProbabilityToAct: config.minProbabilityToAct,
        minRevenueAtRiskToAct: config.minRevenueAtRiskToAct ?? null,
        requireApprovalForSeverity: config.requireApprovalForSeverity ?? null,
        requireApprovalForRevenueAbove: config.requireApprovalForRevenueAbove ?? null,
        requireApprovalForProbabilityAbove: config.requireApprovalForProbabilityAbove ?? null,
        maxAutoExecutionsPerDay: config.maxAutoExecutionsPerDay,
        allowedActionTypesToAutoExecute: allowed,
        requireApprovalForFirstNPerDay: config.requireApprovalForFirstNPerDay,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    console.error("GET /api/settings/autonomous error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load config" },
      { status: 500 }
    );
  }
}

/** PATCH /api/settings/autonomous — update autonomous agent config. */
export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const agentRunning =
      typeof body.agentRunning === "boolean" ? body.agentRunning : undefined;

    const automationLevel = ["off", "assess_only", "draft_only", "full_auto"].includes(
      body.automationLevel
    )
      ? body.automationLevel
      : undefined;
    const signalSources = ["internal_only", "external_only", "both"].includes(
      body.signalSources
    )
      ? body.signalSources
      : undefined;
    const internalSignalMode = ["lookback", "live"].includes(body.internalSignalMode)
      ? body.internalSignalMode
      : undefined;
    const internalSignalLookbackMinutes =
      typeof body.internalSignalLookbackMinutes === "number" &&
      body.internalSignalLookbackMinutes >= 1 &&
      body.internalSignalLookbackMinutes <= 10080
        ? body.internalSignalLookbackMinutes
        : undefined;
    const externalSignalLookbackMinutes =
      typeof body.externalSignalLookbackMinutes === "number" &&
      body.externalSignalLookbackMinutes >= 1 &&
      body.externalSignalLookbackMinutes <= 10080
        ? body.externalSignalLookbackMinutes
        : undefined;
    const minSeverityToAct = ["MINOR", "MODERATE", "SEVERE", "CRITICAL"].includes(
      body.minSeverityToAct
    )
      ? body.minSeverityToAct
      : undefined;
    const minProbabilityToAct =
      typeof body.minProbabilityToAct === "number" &&
      body.minProbabilityToAct >= 0 &&
      body.minProbabilityToAct <= 100
        ? body.minProbabilityToAct
        : undefined;
    const minRevenueAtRiskToAct =
      body.minRevenueAtRiskToAct === null || body.minRevenueAtRiskToAct === undefined
        ? null
        : typeof body.minRevenueAtRiskToAct === "number" && body.minRevenueAtRiskToAct >= 0
          ? body.minRevenueAtRiskToAct
          : undefined;
    const requireApprovalForSeverity =
      body.requireApprovalForSeverity === null || body.requireApprovalForSeverity === ""
        ? null
        : ["MINOR", "MODERATE", "SEVERE", "CRITICAL"].includes(body.requireApprovalForSeverity)
          ? body.requireApprovalForSeverity
          : undefined;
    const requireApprovalForRevenueAbove =
      body.requireApprovalForRevenueAbove === null ||
      body.requireApprovalForRevenueAbove === undefined
        ? null
        : typeof body.requireApprovalForRevenueAbove === "number" &&
            body.requireApprovalForRevenueAbove >= 0
          ? body.requireApprovalForRevenueAbove
          : undefined;
    const requireApprovalForProbabilityAbove =
      body.requireApprovalForProbabilityAbove === null ||
      body.requireApprovalForProbabilityAbove === undefined
        ? null
        : typeof body.requireApprovalForProbabilityAbove === "number" &&
            body.requireApprovalForProbabilityAbove >= 0 &&
            body.requireApprovalForProbabilityAbove <= 100
          ? body.requireApprovalForProbabilityAbove
          : undefined;
    const maxAutoExecutionsPerDay =
      typeof body.maxAutoExecutionsPerDay === "number" &&
      body.maxAutoExecutionsPerDay >= 0 &&
      body.maxAutoExecutionsPerDay <= 100
        ? body.maxAutoExecutionsPerDay
        : undefined;
    const allowedActionTypesToAutoExecute = Array.isArray(
      body.allowedActionTypesToAutoExecute
    )
      ? body.allowedActionTypesToAutoExecute.filter((x: unknown) => typeof x === "string")
      : undefined;
    const requireApprovalForFirstNPerDay =
      typeof body.requireApprovalForFirstNPerDay === "number" &&
      body.requireApprovalForFirstNPerDay >= 0 &&
      body.requireApprovalForFirstNPerDay <= 50
        ? body.requireApprovalForFirstNPerDay
        : undefined;

    // When turning the agent "on" (agentRunning: true) without setting automationLevel, enable full_auto
    // so the run route actually processes signals (it returns early when automationLevel === "off").
    const effectiveAutomationLevel =
      automationLevel ?? (agentRunning === true ? "full_auto" : DEFAULTS.automationLevel);

    const data: Parameters<typeof db.autonomousAgentConfig.upsert>[0]["create"] = {
      companyId: session.companyId,
      agentRunning: agentRunning ?? DEFAULTS.agentRunning,
      automationLevel: effectiveAutomationLevel,
      signalSources: signalSources ?? DEFAULTS.signalSources,
      internalSignalMode: internalSignalMode ?? DEFAULTS.internalSignalMode,
      internalSignalLookbackMinutes: internalSignalLookbackMinutes ?? DEFAULTS.internalSignalLookbackMinutes,
      externalSignalLookbackMinutes: externalSignalLookbackMinutes ?? DEFAULTS.externalSignalLookbackMinutes,
      minSeverityToAct: minSeverityToAct ?? DEFAULTS.minSeverityToAct,
      minProbabilityToAct: minProbabilityToAct ?? DEFAULTS.minProbabilityToAct,
      minRevenueAtRiskToAct: minRevenueAtRiskToAct ?? DEFAULTS.minRevenueAtRiskToAct,
      requireApprovalForSeverity: requireApprovalForSeverity ?? DEFAULTS.requireApprovalForSeverity,
      requireApprovalForRevenueAbove:
        requireApprovalForRevenueAbove ?? DEFAULTS.requireApprovalForRevenueAbove,
      requireApprovalForProbabilityAbove:
        requireApprovalForProbabilityAbove ?? DEFAULTS.requireApprovalForProbabilityAbove,
      maxAutoExecutionsPerDay: maxAutoExecutionsPerDay ?? DEFAULTS.maxAutoExecutionsPerDay,
      allowedActionTypesToAutoExecute:
        allowedActionTypesToAutoExecute ?? DEFAULTS.allowedActionTypesToAutoExecute,
      requireApprovalForFirstNPerDay:
        requireApprovalForFirstNPerDay ?? DEFAULTS.requireApprovalForFirstNPerDay,
    };

    const config = await db.autonomousAgentConfig.upsert({
      where: { companyId: session.companyId },
      create: data,
      update: {
        ...(agentRunning !== undefined && { agentRunning }),
        ...(automationLevel !== undefined && { automationLevel }),
        ...(agentRunning === true && automationLevel === undefined && { automationLevel: "full_auto" }),
        ...(signalSources !== undefined && { signalSources }),
        ...(internalSignalMode !== undefined && { internalSignalMode }),
        ...(internalSignalLookbackMinutes !== undefined && { internalSignalLookbackMinutes }),
        ...(externalSignalLookbackMinutes !== undefined && { externalSignalLookbackMinutes }),
        ...(minSeverityToAct !== undefined && { minSeverityToAct }),
        ...(minProbabilityToAct !== undefined && { minProbabilityToAct }),
        ...(minRevenueAtRiskToAct !== undefined && { minRevenueAtRiskToAct }),
        ...(requireApprovalForSeverity !== undefined && {
          requireApprovalForSeverity: requireApprovalForSeverity,
        }),
        ...(requireApprovalForRevenueAbove !== undefined && {
          requireApprovalForRevenueAbove: requireApprovalForRevenueAbove,
        }),
        ...(requireApprovalForProbabilityAbove !== undefined && {
          requireApprovalForProbabilityAbove: requireApprovalForProbabilityAbove,
        }),
        ...(maxAutoExecutionsPerDay !== undefined && { maxAutoExecutionsPerDay }),
        ...(allowedActionTypesToAutoExecute !== undefined && {
          allowedActionTypesToAutoExecute: allowedActionTypesToAutoExecute,
        }),
        ...(requireApprovalForFirstNPerDay !== undefined && {
          requireApprovalForFirstNPerDay: requireApprovalForFirstNPerDay,
        }),
      },
    });

    return NextResponse.json({
      config: {
        id: config.id,
        companyId: config.companyId,
        agentRunning: config.agentRunning ?? false,
        automationLevel: config.automationLevel,
        signalSources: config.signalSources,
        internalSignalMode: (config as { internalSignalMode?: string }).internalSignalMode ?? DEFAULTS.internalSignalMode,
        internalSignalLookbackMinutes: config.internalSignalLookbackMinutes ?? DEFAULTS.internalSignalLookbackMinutes,
        externalSignalLookbackMinutes: config.externalSignalLookbackMinutes ?? DEFAULTS.externalSignalLookbackMinutes,
        minSeverityToAct: config.minSeverityToAct,
        minProbabilityToAct: config.minProbabilityToAct,
        minRevenueAtRiskToAct: config.minRevenueAtRiskToAct ?? null,
        requireApprovalForSeverity: config.requireApprovalForSeverity ?? null,
        requireApprovalForRevenueAbove: config.requireApprovalForRevenueAbove ?? null,
        requireApprovalForProbabilityAbove:
          config.requireApprovalForProbabilityAbove ?? null,
        maxAutoExecutionsPerDay: config.maxAutoExecutionsPerDay,
        allowedActionTypesToAutoExecute: Array.isArray(config.allowedActionTypesToAutoExecute)
          ? (config.allowedActionTypesToAutoExecute as string[])
          : DEFAULTS.allowedActionTypesToAutoExecute,
        requireApprovalForFirstNPerDay: config.requireApprovalForFirstNPerDay,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    console.error("PATCH /api/settings/autonomous error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save config" },
      { status: 500 }
    );
  }
}
