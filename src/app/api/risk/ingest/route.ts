import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { callZapierMCPTool } from "@/server/zapier/mcp-client";
import { getZapierMCPConfigForCompany, getZapierMCPToolSelections } from "@/server/zapier/mcp-config";

function isFollowUpOrError(text: string): boolean {
  const t = text.trim();
  if (t.startsWith("{") && (t.includes("followUpQuestion") || t.includes("isPreview"))) return true;
  if (/I wasn't able to determine the value for/i.test(t)) return true;
  if (/Could you (provide|specify|clarify)/i.test(t) && t.length < 400) return true;
  if (/I'm specialized in the/i.test(t) && /don't currently have available/i.test(t)) return true;
  return false;
}

/** Extract only the exact information retrieved (no full agent/JSON response). */
function extractExactInformationSummary(rawText: string): string {
  const t = rawText.trim();
  if (!t) return "";
  if (isFollowUpOrError(t)) return "";

  try {
    const parsed = JSON.parse(t);
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const parsedObj = obj as Record<string, unknown>;
      const arr = (parsedObj.results ?? parsedObj.data ?? parsedObj.items ?? parsedObj.emails) as unknown[] | undefined;
      if (Array.isArray(arr) && arr.length > 0) {
        const lines: string[] = [];
        for (const it of arr.slice(0, 5)) {
          if (it && typeof it === "object") {
            const o = it as Record<string, unknown>;
            const subj = typeof o.subject === "string" ? o.subject : undefined;
            const from = o.from && typeof o.from === "object"
              ? ((o.from as { name?: string; email?: string }).name ?? (o.from as { email?: string }).email)
              : undefined;
            const title = typeof o.title === "string" ? o.title : typeof o.name === "string" ? o.name : undefined;
            if (subj != null && from != null) lines.push(`Email: "${subj.slice(0, 60)}" from ${from}`);
            else if (title != null) lines.push(title.slice(0, 80));
            else lines.push(JSON.stringify(o).slice(0, 80));
          }
        }
        return lines.join(" · ");
      }
      const subj = parsedObj.subject;
      const from = parsedObj.from && typeof parsedObj.from === "object"
        ? ((parsedObj.from as { name?: string; email?: string }).name ?? (parsedObj.from as { email?: string }).email)
        : undefined;
      if (typeof subj === "string" && from) return `Email: "${subj.slice(0, 80)}" from ${from}`;
      const title = typeof parsedObj.title === "string" ? parsedObj.title : typeof parsedObj.name === "string" ? parsedObj.name : undefined;
      if (title) return title.slice(0, 200);
    }
  } catch {
    // not JSON
  }
  const stripped = t.replace(/^(Here are the results?|The following was retrieved|Result:)\s*/i, "").trim();
  return stripped.slice(0, 200);
}

function getTextFromContentPart(item: unknown): string | null {
  if (!item) return null;
  if (typeof item === "string") return item.trim() || null;
  if (typeof item === "object" && item !== null) {
    const o = item as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim() || null;
    if (Array.isArray(o.content)) {
      const first = o.content[0];
      if (first && typeof first === "object" && first !== null && "text" in first && typeof (first as { text: unknown }).text === "string") {
        return ((first as { text: string }).text).trim() || null;
      }
    }
  }
  return null;
}

function itemToSummary(item: unknown): string | null {
  const raw = getTextFromContentPart(item);
  if (raw) {
    const exact = extractExactInformationSummary(raw);
    return exact || null;
  }
  if (item && typeof item === "object") {
    const exact = extractExactInformationSummary(JSON.stringify(item));
    return exact || null;
  }
  return null;
}

/** Get array of email-like items from parsed Zapier response (various key names). */
function getEmailLikeArray(parsed: Record<string, unknown>): Array<Record<string, unknown>> {
  const arr = (parsed.results ?? parsed.data ?? parsed.items ?? parsed.emails ?? parsed.messages ?? parsed.output) as unknown[] | undefined;
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr.filter((it): it is Record<string, unknown> => it != null && typeof it === "object");
}

/** If the raw string is a JSON array, return it as array of objects; otherwise null. */
function parseAsArray(raw: string): Array<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.filter((it): it is Record<string, unknown> => it != null && typeof it === "object");
  } catch {
    return null;
  }
}

/** Extract clean email summaries from Gmail find/search result JSON — only the exact info retrieved. */
function* gmailResultsToSummaries(content: unknown[]): Generator<{ summary: string; raw: unknown }> {
  for (const item of content) {
    let raw: string | null = null;
    if (item && typeof item === "object") {
      if ("text" in item && typeof (item as { text: unknown }).text === "string") {
        raw = (item as { text: string }).text.trim();
      } else if ("content" in item && Array.isArray((item as { content: unknown }).content)) {
        const first = (item as { content: unknown[] }).content[0];
        if (first && typeof first === "object" && "text" in first && typeof (first as { text: string }).text === "string") {
          raw = (first as { text: string }).text.trim();
        }
      }
    } else if (typeof item === "string") {
      raw = item.trim();
    }
    if (!raw || raw.length < 2) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const exact = extractExactInformationSummary(raw);
      if (exact) yield { summary: exact, raw: item };
      continue;
    }
    if (isFollowUpOrError(raw)) continue;

    let arr = getEmailLikeArray(parsed);
    if (arr.length === 0) {
      const topLevelArray = parseAsArray(raw);
      if (topLevelArray) arr = topLevelArray;
    }
    if (arr.length === 0) {
      const exact = extractExactInformationSummary(raw);
      if (exact) yield { summary: exact, raw: item };
      continue;
    }
    for (const r of arr.slice(0, 20)) {
      const fromObj = r.from ?? r.sender ?? r.from_email;
      const from = fromObj && typeof fromObj === "object"
        ? String((fromObj as { name?: string }).name ?? (fromObj as { email?: string }).email ?? "Unknown")
        : String(fromObj ?? "Unknown");
      const subj = String(r.subject ?? r.title ?? r.snippet ?? "").slice(0, 80);
      const summary = subj ? `Email: "${subj}" from ${from}` : `Email from ${from}`;
      yield { summary, raw: r };
    }
  }
}

function* contentToItems(content: unknown[], skipFollowUps = true): Generator<{ summary: string; raw: unknown }> {
  if (!content?.length) return;
  for (const item of content) {
    const summary = itemToSummary(item);
    if (!summary) continue;
    if (skipFollowUps && isFollowUpOrError(summary)) continue;
    yield { summary, raw: item };
  }
}

/** Only call tools that are read-style (find, search, list, get). Skip action tools (reply, send, remove, etc.). */
function isReadOnlyTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  const readPatterns = ["find", "search", "list", "get", "fetch", "read", "retrieve"];
  const actionPatterns = ["reply", "send", "remove", "add", "create", "update", "delete", "mark", "move", "label"];
  if (actionPatterns.some((a) => lower.includes(a))) return false;
  return readPatterns.some((r) => lower.includes(r));
}

/** Skip tools that require user-specific args we can't provide during auto ingest (e.g. attachment filename, file ID). */
function isIngestibleWithoutUserInput(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  if (lower.includes("attachment_by_filename") || lower.includes("get_attachment")) return false;
  if (lower.includes("by_id") && (lower.includes("retrieve") || lower.includes("file") || lower.includes("folder"))) return false;
  if (lower.includes("by_filename")) return false;
  return true;
}

/** Zapier MCP tools require an "instructions" string. Provide a natural-language request per tool type. */
function getDefaultArgsForTool(toolName: string): Record<string, unknown> {
  const lower = toolName.toLowerCase();
  let instructions = "Return the 20 most recent items.";
  if (lower.includes("gmail_find") || lower.includes("gmail_find_email") || (lower.includes("gmail") && lower.includes("find"))) {
    instructions = "Get my 20 most recent emails from my inbox and return their subject, snippet, and sender.";
  } else if (lower.includes("gmail") && (lower.includes("search") || lower.includes("get"))) {
    instructions = "Search my Gmail for the 20 most recent emails in inbox and return their details.";
  } else if (lower.includes("outlook") || lower.includes("microsoft")) {
    instructions = "Get my 20 most recent emails from inbox and return their subject and body snippet.";
  } else if (lower.includes("drive") && lower.includes("retrieve")) {
    instructions = "List my 20 most recently modified files or folders (or recent items I have access to).";
  } else if (lower.includes("list") || lower.includes("search") || lower.includes("find")) {
    instructions = "Return up to 20 of the most recent or relevant items.";
  }
  return {
    instructions,
    limit: 20,
    max_results: 20,
    search_string: lower.includes("gmail") ? "in:inbox" : undefined,
    maxResults: 20,
  };
}

/**
 * POST /api/risk/ingest
 * Calls each of the company's input-context Zapier MCP tools to fetch recent data (e.g. emails),
 * then stores results as IngestedEvent so Signals & Risk/Impact Analysis can show live signals.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config, toolSelections] = await Promise.all([
    getZapierMCPConfigForCompany(session.companyId),
    getZapierMCPToolSelections(session.companyId),
  ]);

  if (!config) {
    return NextResponse.json(
      { error: "Zapier not connected. Connect in Dashboard → Integrations." },
      { status: 503 }
    );
  }

  const inputContextTools = toolSelections.inputContextTools;
  if (inputContextTools.length === 0) {
    return NextResponse.json(
      { error: "No input-context tools configured. Assign tools in Integrations (input context zone)." },
      { status: 400 }
    );
  }

  const readOnlyTools = inputContextTools.filter((t) => isReadOnlyTool(t) && isIngestibleWithoutUserInput(t));
  if (readOnlyTools.length === 0) {
    return NextResponse.json(
      { error: "No read-style tools in input context (e.g. Gmail Find Email, Search). Add find/search/list tools to the input context zone." },
      { status: 400 }
    );
  }

  const created: { id: string; source: string; toolName: string }[] = [];
  const toolResults: { name: string; status: "ok" | "empty" | "error"; count: number }[] = [];
  const sourceByTool = (name: string) => name.split(":")[0]?.trim() || name;

  const isGmailEmailTool = (t: string) => {
    const lower = t.toLowerCase();
    return lower.includes("gmail") && (lower.includes("find") || lower.includes("search") || lower.includes("get") || lower.includes("list"));
  };

  for (const toolName of readOnlyTools) {
    try {
      const args = getDefaultArgsForTool(toolName);
      const result = await callZapierMCPTool(config, toolName, args);
      if (result.isError) {
        console.warn(`Ingest: ${toolName} returned isError`, JSON.stringify(result.content?.slice(0, 1)).slice(0, 300));
        toolResults.push({ name: toolName, status: "error", count: 0 });
        continue;
      }
      if (!result.content?.length) {
        console.warn(`Ingest: ${toolName} returned empty content`);
        toolResults.push({ name: toolName, status: "empty", count: 0 });
        continue;
      }

      const source = sourceByTool(toolName);
      let content = result.content;

      const first = content[0];
      if (first && typeof first === "object" && first !== null && !("text" in first) && "content" in first) {
        const inner = (first as { content: unknown[] }).content;
        if (Array.isArray(inner)) content = inner;
      }

      const items = isGmailEmailTool(toolName)
        ? [...gmailResultsToSummaries(content)].slice(0, 20)
        : [...contentToItems(content)].slice(0, 20);

      if (items.length === 0) {
        const firstPart = content[0];
        const sample =
          firstPart && typeof firstPart === "object" && firstPart !== null
            ? { keys: Object.keys(firstPart), textPreview: getTextFromContentPart(firstPart)?.slice(0, 400) }
            : null;
        console.log(`Ingest: ${toolName} produced 0 items. Sample:`, JSON.stringify(sample));

        let fallback = content.length === 1 ? itemToSummary(content[0]) : itemToSummary(content);
        if (!fallback) {
          const rawText = getTextFromContentPart(content[0]);
          if (rawText && rawText.length > 10 && !isFollowUpOrError(rawText)) {
            fallback = rawText.slice(0, 200).trim();
            if (fallback.length === 200) fallback += "…";
          }
        }
        if (fallback && !isFollowUpOrError(fallback)) {
          const event = await db.ingestedEvent.create({
            data: {
              companyId: session.companyId,
              source,
              toolName,
              rawContent: content as object,
              signalSummary: fallback,
            },
          });
          created.push({ id: event.id, source, toolName });
          toolResults.push({ name: toolName, status: "ok", count: 1 });
        } else {
          toolResults.push({ name: toolName, status: "empty", count: 0 });
        }
        continue;
      }
      toolResults.push({ name: toolName, status: "ok", count: items.length });
      for (const { summary, raw } of items) {
        const event = await db.ingestedEvent.create({
          data: {
            companyId: session.companyId,
            source,
            toolName,
            rawContent: (raw as object) ?? undefined,
            signalSummary: summary,
          },
        });
        created.push({ id: event.id, source, toolName });
      }
    } catch (err) {
      console.error(`Zapier ingest failed for tool ${toolName}:`, err);
      toolResults.push({ name: toolName, status: "error", count: 0 });
    }
  }

  return NextResponse.json({
    success: true,
    ingested: created.length,
    events: created,
    tools: toolResults,
  });
}
