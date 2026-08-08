"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendCaptureMessage } from "@/app/capture/chat-actions";
import type { ChatMessage } from "@/lib/db/types";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "sent" | "pending" | "failed";
  flagged?: boolean;
};

export function ChatCapture({
  initialMessages,
  greeting,
}: {
  initialMessages: ChatMessage[];
  greeting: string;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content, status: "sent" })),
  );
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");

    const userBubbleId = `local-${Date.now()}`;
    const pendingId = `${userBubbleId}-reply`;
    setBubbles((prev) => [
      ...prev,
      { id: userBubbleId, role: "user", content: text, status: "sent" },
      { id: pendingId, role: "assistant", content: "logging...", status: "pending" },
    ]);

    startTransition(async () => {
      try {
        const result = await sendCaptureMessage(text);
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === pendingId
              ? {
                  id: result.assistantMessage.id,
                  role: "assistant" as const,
                  content: result.assistantMessage.content,
                  status: "sent" as const,
                  flagged: result.entry.needs_review,
                }
              : b,
          ),
        );
      } catch (err) {
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === pendingId
              ? {
                  ...b,
                  status: "failed" as const,
                  content: err instanceof Error ? err.message : "couldn't log that, try again",
                }
              : b,
          ),
        );
      }
    });
  }

  return (
    <div className="card d1 flex flex-col gap-3">
      <div className="chat-thread" ref={threadRef}>
        {bubbles.length === 0 && <div className="bubble assistant">{greeting}</div>}
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`bubble ${b.role} ${b.status !== "sent" ? b.status : ""}`.trim()}
          >
            {b.content}
            {b.flagged && <span className="flag">not sure about this one, reply to fix it up</span>}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="chat-input-row">
        <input
          className="field"
          placeholder="log a task, note, expense..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button type="submit" className="sticker-btn primary" disabled={pending || !input.trim()}>
          send
        </button>
      </form>
      <a href="/capture/manual" className="sub" style={{ fontSize: 13 }}>
        manual entry &rarr;
      </a>
    </div>
  );
}
