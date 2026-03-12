import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getGeminiModelForCompany } from "@/server/gemini-model-preference";
import { BackboardClient } from "@/server/memory/backboard-client";

type ChatRole = "user" | "assistant";
type ChatHistoryMessage = { role: ChatRole; content: string };
type PersistedChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
};

const CHAT_TITLE = "Company Q&A";
const THREAD_MESSAGES_LIMIT = 60;
const HISTORY_LIMIT = 20;
const LATEST_COMPANY_ROWS_LIMIT = 10;
const REASONING_TRACES_LIMIT = 20;
const AUTONOMOUS_LOGS_LIMIT = 20;
const CONTEXT_MAX_CHARS = 35_000;
const MEMORY_MAX_CHARS = 8_000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

function isPrismaTableMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "P2021";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function clip(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatConversation(history: ChatHistoryMessage[]): string {
  return history.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`).join("\n");
}

function buildQaPrompt(history: ChatHistoryMessage[], contextBlock: string): string {
  const historyText = formatConversation(history);
  return `
You are PENTAGON's embedded company Q&A copilot.

Rules:
- Answer with high signal and concise business language.
- Use available context from company setup, risk analysis, autonomous logs, mitigation plans, and backboard memory.
- If data is uncertain or missing, say so explicitly and provide the best next step.
- Do not invent tools/actions already executed; distinguish "already done" vs "recommended next".

Conversation:
${historyText}

Company + analysis + memory context:
${contextBlock}
`;
}

async function getBackboardMemories(companyId: string): Promise<string> {
  const memoryThreads = await db.memoryThread.findMany({
    where: { companyId },
    select: { agentType: true, backboardAssistantId: true },
    take: LATEST_COMPANY_ROWS_LIMIT,
  });
  if (!memoryThreads.length) return "No backboard memory threads configured.";

  const backboard = new BackboardClient(process.env.BACKBOARD_API_KEY || "");
  if (!backboard.isConfigured()) return "Backboard API key not configured.";

  const parts: string[] = [];
  for (const thread of memoryThreads) {
    try {
      const memories = await backboard.getMemories(thread.backboardAssistantId);
      parts.push(`AgentType=${thread.agentType}\nMemories=${clip(safeJson(memories), MEMORY_MAX_CHARS)}`);
    } catch (err) {
      parts.push(`AgentType=${thread.agentType}\nMemoriesError=${String(err)}`);
    }
  }
  return parts.join("\n\n");
}

async function buildCompanyContext(companyId: string, userId: string): Promise<string> {
  const [company, baseProfile, highLevelProfile, riskCases, plans, traces, ingestedEvents, externalSignals, logs, archives, playbook] =
    await Promise.all([
      db.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, key: true } }),
      db.companyProfileBase.findUnique({ where: { companyId } }),
      db.companyProfileHighLevel.findUnique({ where: { companyId } }),
      db.riskCase.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
        include: { scenarios: true },
      }),
      db.mitigationPlan.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
      }),
      db.reasoningTrace.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: REASONING_TRACES_LIMIT,
      }),
      db.ingestedEvent.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
      }),
      db.savedExternalSignal.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
      }),
      db.autonomousAgentLog.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: AUTONOMOUS_LOGS_LIMIT,
      }),
      db.assessmentArchive.findMany({
        where: { companyId },
        orderBy: { sentAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
      }),
      db.playbookEntry.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: LATEST_COMPANY_ROWS_LIMIT,
      }),
    ]);

  const backboardMemories = await getBackboardMemories(companyId);

  const context = {
    requesterUserId: userId,
    company,
    baseProfile,
    highLevelProfile,
    latestRiskCases: riskCases,
    latestMitigationPlans: plans,
    latestReasoningTraces: traces,
    latestIngestedEvents: ingestedEvents,
    latestExternalSignals: externalSignals,
    latestAutonomousLogs: logs,
    latestAssessmentArchive: archives,
    latestPlaybookEntries: playbook,
    backboardMemories,
  };

  return clip(JSON.stringify(context, null, 2), CONTEXT_MAX_CHARS);
}

async function resolveThreadId(companyId: string, requestedThreadId?: string): Promise<string | null> {
  const existingThread = requestedThreadId
    ? await db.chatThread.findFirst({
        where: { id: requestedThreadId, companyId },
        select: { id: true },
      })
    : await db.chatThread.findFirst({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

  if (existingThread) return existingThread.id;

  const createdThread = await db.chatThread.create({
    data: { companyId, title: CHAT_TITLE },
    select: { id: true },
  });
  return createdThread.id;
}

async function fetchThreadHistory(companyId: string, threadId: string): Promise<ChatHistoryMessage[]> {
  return db.chatMessage.findMany({
    where: { threadId, companyId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  }) as Promise<ChatHistoryMessage[]>;
}

async function saveAssistantMessage(
  companyId: string,
  threadId: string | null,
  content: string,
): Promise<PersistedChatMessage> {
  if (!threadId) {
    return {
      id: `temp-${Date.now()}`,
      role: "assistant",
      content,
      createdAt: new Date(),
    };
  }

  return db.chatMessage.create({
    data: {
      threadId,
      companyId,
      role: "assistant",
      content,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  }) as Promise<PersistedChatMessage>;
}

export async function GET() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thread = await db.chatThread.findFirst({
      where: { companyId: session.companyId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });

    if (!thread) {
      return NextResponse.json({ thread: null, messages: [] });
    }

    const messages = await db.chatMessage.findMany({
      where: { threadId: thread.id, companyId: session.companyId },
      orderBy: { createdAt: "asc" },
      take: THREAD_MESSAGES_LIMIT,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return NextResponse.json({ thread, messages });
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      // Fallback for environments where chat tables are not migrated yet.
      return NextResponse.json({ thread: null, messages: [], persistence: "disabled" });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { message?: string; threadId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // no-op
    }

    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    let threadId: string | null = null;
    let history: ChatHistoryMessage[] = [{ role: "user", content: message }];
    let persistenceDisabled = false;

    try {
      threadId = await resolveThreadId(session.companyId, body.threadId);

      await db.chatMessage.create({
        data: {
          threadId,
          companyId: session.companyId,
          role: "user",
          content: message,
        },
      });

      history = await fetchThreadHistory(session.companyId, threadId);
    } catch (err) {
      if (isPrismaTableMissing(err)) {
        persistenceDisabled = true;
      } else {
        throw err;
      }
    }

    const contextBlock = await buildCompanyContext(session.companyId, session.userId);
    const prompt = buildQaPrompt(history, contextBlock);
    const model = await getGeminiModelForCompany(session.companyId);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const assistantText = (response.text ?? "").trim() || "I could not generate a response right now.";

    const assistant = await saveAssistantMessage(session.companyId, threadId, assistantText);

    return NextResponse.json({
      threadId,
      message: assistant,
      ...(persistenceDisabled ? { persistence: "disabled" } : {}),
    });
  } catch (err) {
    console.error("POST /api/chat/qa failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedThreadId = searchParams.get("threadId");
    const thread = requestedThreadId
      ? await db.chatThread.findFirst({
          where: { id: requestedThreadId, companyId: session.companyId },
          select: { id: true },
        })
      : await db.chatThread.findFirst({
          where: { companyId: session.companyId },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });

    if (!thread) {
      return NextResponse.json({ success: true, deleted: false });
    }

    await db.chatThread.delete({
      where: { id: thread.id },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (err) {
    if (isPrismaTableMissing(err)) {
      return NextResponse.json({ success: true, deleted: false, persistence: "disabled" });
    }
    console.error("DELETE /api/chat/qa failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat delete failed" },
      { status: 500 },
    );
  }
}
