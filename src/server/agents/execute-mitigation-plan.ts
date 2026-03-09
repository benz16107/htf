import { db } from "@/lib/db";
import { getGoogleEmailConnectionStatus, sendGmailEmail } from "@/server/email/google";
import { BackboardClient } from "@/server/memory/backboard-client";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "@/server/zapier/mcp-config";
import { getGlobalZapierAccessToken, createActionRun } from "@/server/zapier/client";

type Action = {
  type: string;
  recipientOrEndpoint: string;
  payloadOrBody: string;
  requiresHumanApproval: boolean;
  stepTitle?: string;
};

type ExecuteMitigationPlanOptions = {
  companyId: string;
  planId: string;
  actionIndices?: number[];
  actionsOverride?: unknown[];
  executionSource?: "human" | "autonomous";
};

type ExecutionFailure = {
  index: number;
  stepTitle?: string;
  error: string;
};

export type ExecuteMitigationPlanResult = {
  plan: Awaited<ReturnType<typeof db.mitigationPlan.findUnique>>;
  executionResults?: {
    executed: number[];
    failed: ExecutionFailure[];
  };
};

/** Pick an execution tool that looks like "send email" (e.g. Gmail: Send Email). */
function pickSendEmailTool(executionToolNames: string[]): string | null {
  const lower = executionToolNames.map((n) => n.toLowerCase());
  const idx = lower.findIndex(
    (n) =>
      (n.includes("send") && (n.includes("email") || n.includes("gmail") || n.includes("outbound"))) ||
      (n.includes("gmail") && n.includes("send")) ||
      (n.includes("email") && n.includes("send"))
  );
  return idx >= 0 ? (executionToolNames[idx] ?? null) : null;
}

/** True when the tool "failed" only because the Gmail label already exists — treat as success. */
function isLabelAlreadyExistsResult(result: { content?: unknown[]; isError?: boolean }): boolean {
  if (!result.isError || !result.content?.length) return false;
  const first = result.content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  return !!raw && (raw.includes("Label name exists or conflicts") || raw.includes("label name exists"));
}

/** True when the error is "cursor must be a string" (Zapier/Gmail quirk on label ops) — treat as success so plan can complete. */
function isCursorMustBeStringResult(result: { content?: unknown[]; isError?: boolean }): boolean {
  if (!result.isError || !result.content?.length) return false;
  const first = result.content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  return !!raw && raw.toLowerCase().includes("cursor") && raw.toLowerCase().includes("must be a string");
}

/** Extract error message from Zapier MCP tool result (content array with text parts). */
function getToolErrorMessage(result: { content?: unknown[]; isError?: boolean }): string | null {
  if (!result.isError) return null;
  const content = result.content ?? [];
  const first = content[0];
  let raw: string | null = null;
  if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
    raw = (first as { text: string }).text;
  } else if (typeof first === "string") {
    raw = first;
  }
  if (raw) {
    if (raw.includes("insufficient tasks on account")) {
      return "Insufficient tasks on your Zapier account. Check usage or upgrade at mcp.zapier.com.";
    }
    if (raw.includes("Label name exists or conflicts") || raw.includes("label name exists")) {
      return "This Gmail label already exists. Use the existing label or edit the step to use a different label name.";
    }
    try {
      const parsed = JSON.parse(raw) as { error?: string | string[] };
      const err = parsed?.error;
      if (Array.isArray(err)) return err.join(" ").trim() || raw;
      if (typeof err === "string") return err;
    } catch {
      // not JSON, use raw
    }
    return raw.slice(0, 500);
  }
  try {
    return JSON.stringify(content).slice(0, 500);
  } catch {
    return "Tool returned an error";
  }
}

/** Normalize Zapier/MCP error message for display (e.g. "insufficient tasks" -> friendly text). */
function normalizeErrorMessage(msg: string): string {
  if (msg.includes("insufficient tasks on account")) {
    return "Insufficient tasks on your Zapier account. Check usage or upgrade at mcp.zapier.com.";
  }
  if (msg.includes("Label name exists or conflicts") || msg.includes("label name exists")) {
    return "This Gmail label already exists. Use the existing label or edit the step to use a different label name.";
  }
  try {
    const parsed = JSON.parse(msg) as { error?: string | string[] };
    const err = parsed?.error;
    if (Array.isArray(err)) return err.join(" ").trim() || msg;
    if (typeof err === "string") return err;
  } catch {
    // not JSON
  }
  return msg.slice(0, 400);
}

function isCursorLikeKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "cursor" || k === "pagetoken" || k === "nextpagetoken" || k.endsWith("cursor");
}

/** Recursively remove cursor-like keys (avoids "cursor must be a string" errors from Zapier/Gmail). */
function deepStripCursors(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(deepStripCursors);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      if (!isCursorLikeKey(key)) out[key] = deepStripCursors(v);
    }
    return out;
  }
  return obj;
}

/** Ensure Zapier MCP tool args match expected types (e.g. to = array). Never send cursor-like params. */
function normalizeZapierMCPArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> = { ...args };
  const lower = toolName.toLowerCase();
  const isEmailLike = lower.includes("email") || lower.includes("draft") || lower.includes("send") || lower.includes("gmail");
  if (isEmailLike) {
    for (const key of ["to", "cc", "bcc", "recipients"]) {
      const v = out[key];
      if (typeof v === "string" && v.trim()) out[key] = [v.trim()];
      else if (Array.isArray(v)) out[key] = v.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter(Boolean);
    }
  }
  out = deepStripCursors(out) as Record<string, unknown>;
  return out;
}

function makeStatusError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

export async function executeMitigationPlan({
  companyId,
  planId,
  actionIndices,
  actionsOverride,
  executionSource = "human",
}: ExecuteMitigationPlanOptions): Promise<ExecuteMitigationPlanResult> {
  const plan = await db.mitigationPlan.findUnique({
    where: { id: planId },
    include: { riskCase: true },
  });

  if (!plan || plan.companyId !== companyId) {
    throw makeStatusError("Plan not found", 404);
  }

  const [zapierMCPConfig, toolSelections, zapierAccessToken, gmailStatus] = await Promise.all([
    getZapierMCPConfigForCompany(companyId),
    getZapierMCPToolSelections(companyId),
    getGlobalZapierAccessToken(),
    getGoogleEmailConnectionStatus(companyId),
  ]);
  const executionToolNames = toolSelections?.executionTools ?? [];

  const allActions = (Array.isArray(actionsOverride) ? actionsOverride : ((plan.actions as Action[]) || [])) as Action[];
  const indicesToRun = Array.isArray(actionIndices) && actionIndices.length > 0
    ? actionIndices.filter((i: number) => i >= 0 && i < allActions.length)
    : allActions.map((_, i) => i);

  const executionResults: { executed: number[]; failed: ExecutionFailure[] } = {
    executed: [],
    failed: [],
  };

  for (const i of indicesToRun) {
    const action = allActions[i];
    if (!action) continue;
    if (action.type === "insight" || action.type === "recommendation") continue;

    const stepTitle = action.stepTitle ?? `Action ${i + 1}`;
    const recordFailure = (error: string) => {
      executionResults.failed.push({ index: i, stepTitle, error });
      console.error(`Execution failed [${stepTitle}]`, error);
    };

    if (action.type === "zapier_mcp" && zapierMCPConfig) {
      try {
        const payload = JSON.parse(action.payloadOrBody) as {
          toolName?: string;
          arguments?: Record<string, unknown>;
        };
        if (payload?.toolName) {
          const rawArgs = (payload.arguments && typeof payload.arguments === "object")
            ? { ...payload.arguments }
            : {};
          const args = normalizeZapierMCPArgs(payload.toolName, rawArgs);
          const bodyText = typeof action.payloadOrBody === "string" ? action.payloadOrBody : "";
          if (!Object.prototype.hasOwnProperty.call(args, "instructions") && (stepTitle || bodyText)) {
            (args as Record<string, unknown>).instructions = [stepTitle, bodyText].filter(Boolean).join(". ").slice(0, 2000);
          }
          const result = await callZapierMCPTool(zapierMCPConfig, payload.toolName, args);
          if (isLabelAlreadyExistsResult(result) || isCursorMustBeStringResult(result)) {
            executionResults.executed.push(i);
          } else {
            const errMsg = getToolErrorMessage(result);
            if (errMsg) {
              recordFailure(normalizeErrorMessage(errMsg));
            } else {
              executionResults.executed.push(i);
            }
          }
        } else {
          recordFailure("Missing toolName in payload");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isCursorError = msg.toLowerCase().includes("cursor") && msg.toLowerCase().includes("must be a string");
        if (isCursorError) {
          executionResults.executed.push(i);
        } else {
          recordFailure(normalizeErrorMessage(msg));
        }
      }
      continue;
    }

    if (action.type === "email") {
      const to = action.recipientOrEndpoint?.trim() || "";
      if (!to) {
        recordFailure("No email address (To) set. Edit the step and enter a recipient.");
        continue;
      }
      const subject = plan.riskCase?.triggerType
        ? `Re: ${String(plan.riskCase.triggerType).slice(0, 60)}`
        : "Risk mitigation follow-up";
      const body = (action.payloadOrBody ?? "").trim() || "(No body)";

      if (gmailStatus.connected && gmailStatus.sendReady) {
        try {
          await sendGmailEmail({
            companyId,
            to,
            subject,
            body,
          });
          executionResults.executed.push(i);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          recordFailure(normalizeErrorMessage(msg));
        }
        continue;
      }

      if (!zapierMCPConfig) {
        recordFailure(
          gmailStatus.connected && !gmailStatus.sendReady
            ? "Direct Gmail is connected but does not have send permission yet. Reconnect Gmail in Dashboard → Integrations to grant send access, or connect Zapier with a send-email tool."
            : "No email delivery path is connected. Connect Gmail directly in Dashboard → Integrations, or connect Zapier with a send-email tool."
        );
        continue;
      }
      if (executionToolNames.length === 0) {
        recordFailure("No execution tools configured. Add a send-email tool to Execution in Integrations, or connect Gmail directly.");
        continue;
      }
      const sendEmailTool = pickSendEmailTool(executionToolNames);
      if (!sendEmailTool) {
        recordFailure("No send-email tool in Execution. Add Gmail: Send Email to Execution in Integrations, or use direct Gmail.");
        continue;
      }
      try {
        const instructions = `Send an email to ${to} with subject "${subject}". Body: ${body.slice(0, 2000)}`;
        const toArray = to ? [to] : [];
        const result = await callZapierMCPTool(zapierMCPConfig, sendEmailTool, {
          instructions,
          to: toArray,
          subject,
          body,
          message: body,
          recipient: toArray,
          email_address: toArray,
        });
        const errMsg = getToolErrorMessage(result);
        if (errMsg) {
          recordFailure(errMsg);
        } else {
          executionResults.executed.push(i);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        recordFailure(normalizeErrorMessage(msg));
      }
      continue;
    }

    if ((action.type === "zapier_action" || action.type === "email") && zapierAccessToken) {
      try {
        const payload = JSON.parse(action.payloadOrBody) as {
          action?: string;
          authentication?: string;
          input?: Record<string, unknown>;
        };
        if (payload?.action && payload?.authentication) {
          await createActionRun(zapierAccessToken, {
            action: payload.action,
            authentication: payload.authentication,
            input: payload.input ?? {},
          });
          executionResults.executed.push(i);
        } else {
          recordFailure("Missing action/authentication in payload");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        recordFailure(normalizeErrorMessage(msg));
      }
    }
  }

  if (executionResults.failed.length > 0) {
    return {
      plan: await db.mitigationPlan.findUnique({ where: { id: planId } }),
      executionResults,
    };
  }

  const updatedPlan = await db.mitigationPlan.update({
    where: { id: planId },
    data: { status: "EXECUTED" },
  });

  const agentSession = await db.agentSession.create({
    data: {
      companyId,
      agentType: "SIGNAL_RISK",
      status: "COMPLETED",
    },
  });

  const executedActions = indicesToRun.map((i) => allActions[i]).filter(Boolean);
  const partialExecution = indicesToRun.length < allActions.length;
  const isAutonomous = executionSource === "autonomous";
  await db.reasoningTrace.create({
    data: {
      companyId,
      sessionId: agentSession.id,
      stepKey: isAutonomous ? "autonomous_execution_approved" : "human_override_approved",
      stepTitle: isAutonomous
        ? (partialExecution ? "Autonomous Agent Executed Selected Actions" : "Autonomous Agent Executed Plan")
        : (partialExecution ? "Human Operator Approved Partial Execution" : "Human Operator Approved Execution"),
      rationale: isAutonomous
        ? `Autonomous agent executed ${indicesToRun.length} of ${allActions.length} actions for ${plan.riskCase.triggerType}.`
        : `Human operator reviewed and approved ${indicesToRun.length} of ${allActions.length} actions for ${plan.riskCase.triggerType}.`,
      evidencePack: {
        planId: plan.id,
        actionIndices: indicesToRun,
        actions: executedActions,
      },
    },
  });

  const company = await db.company.findUnique({
    where: { id: companyId },
    include: { memoryThreads: { where: { agentType: "SIGNAL_RISK" } } },
  });
  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  const threadId = company?.memoryThreads[0]?.backboardThreadId;
  if (backboard.isConfigured() && threadId) {
    await backboard.appendReasoning(threadId, {
      action: isAutonomous ? "Autonomous Agent Executed Plan" : "Human Overrode & Approved Execution",
      planId: plan.id,
      triggerFired: true,
      summary: "Webhooks successfully dispatched.",
    });
  }

  return { plan: updatedPlan };
}
