"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

type InitResponse = {
  thread: { id: string } | null;
  messages: ChatMessage[];
  error?: string;
};

type SendResponse = {
  threadId: string | null;
  message?: ChatMessage;
  error?: string;
};

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function FloatingQaChatbot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialized || initializing) return;

    let cancelled = false;
    const load = async () => {
      setInitializing(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/qa", { method: "GET" });
        const data = await readJson<InitResponse>(res);
        if (!res.ok) {
          if (!cancelled) setError(data?.error ?? "Unable to initialize chat.");
          return;
        }
        if (!cancelled) {
          setThreadId(data?.thread?.id ?? null);
          setMessages(Array.isArray(data?.messages) ? data.messages : []);
        }
      } catch {
        if (!cancelled) setError("Unable to initialize chat.");
      } finally {
        if (!cancelled) {
          setInitializing(false);
          setInitialized(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, initialized, initializing]);

  useEffect(() => {
    if (!open) return;
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, loading]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  if (pathname === "/") return null;

  const startNewChat = async () => {
    if (loading) return;
    setError(null);
    setInitializing(false);
    if (threadId) {
      try {
        await fetch(`/api/chat/qa?threadId=${encodeURIComponent(threadId)}`, {
          method: "DELETE",
        });
      } catch {
        // Best-effort cleanup; UI still resets below.
      }
    }
    setThreadId(null);
    setMessages([]);
    setInput("");
    setInitialized(true);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSend) return;

    const raw = input.trim();
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: raw,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: raw, threadId }),
      });
      const data = await readJson<SendResponse>(res);
      if (!res.ok) {
        setError(data?.error ?? "Chat request failed.");
        return;
      }
      setThreadId(data?.threadId ?? threadId);
      if (data?.message) {
        setMessages((prev) => [...prev, data.message as ChatMessage]);
      }
    } catch {
      setError("Chat request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="floating-chatbot">
      {open ? (
        <section className="floating-chatbot__panel card" aria-label="Company Q&A chatbot">
          <div className="floating-chatbot__header">
            <div>
              <h4>Company Q&A</h4>
            </div>
            <div className="floating-chatbot__header-actions">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={startNewChat}
                disabled={loading}
                aria-label="Start new chat"
              >
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  add_comment
                </span>
                Start new
              </button>
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => setOpen(false)}
                aria-label="Close current chat"
              >
                <span className="material-symbols-rounded btn__icon" aria-hidden>
                  close
                </span>
                Close
              </button>
            </div>
          </div>

          <div className="floating-chatbot__messages" ref={listRef}>
            {initializing ? <p className="muted text-sm">Loading context...</p> : null}
            {!initializing && messages.length === 0 ? (
              <p className="muted text-sm">Ask a question.</p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`floating-chatbot__msg ${
                  m.role === "assistant" ? "floating-chatbot__msg--assistant" : "floating-chatbot__msg--user"
                }`}
              >
                <p>{m.content}</p>
              </div>
            ))}
            {loading ? <p className="muted text-sm">Thinking...</p> : null}
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <form className="floating-chatbot__composer" onSubmit={onSubmit}>
            <input
              className="input"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn primary btn-sm" disabled={!canSend}>
              <span className="material-symbols-rounded btn__icon" aria-hidden>
                send
              </span>
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="floating-chatbot__trigger btn primary"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open company Q&A chatbot"
      >
        <span className="material-symbols-rounded btn__icon" aria-hidden>
          chat
        </span>
        Chat
      </button>
    </div>
  );
}
