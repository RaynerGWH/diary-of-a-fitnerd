"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { shuffle } from "animejs";
import { sendCaptureMessage } from "@/app/capture/chat-actions";
import { CactusIcon } from "./Doodle";
import type { ChatMessage } from "@/lib/db/types";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "sent" | "pending" | "failed";
  flagged?: boolean;
};

// Rotates through while a message is being parsed, instead of sitting on a
// single static "logging..." the whole time.
const PLAYFUL_VERBS = [
  "mulling it over...",
  "scribbling...",
  "sorting the pile...",
  "connecting the dots...",
  "filing away...",
  "deciphering...",
  "tidying up...",
  "cross-referencing...",
  "double-checking...",
  "categorizing...",
  "making sense of it...",
  "noodling...",
  "penciling in...",
  "triangulating...",
  "bookkeeping...",
  "parsing the vibes...",
];

// Cap on how tall the composer can grow before it scrolls internally
// instead of pushing the send button further down.
const TEXTAREA_MAX_HEIGHT = 120;

function PendingLabel() {
  const wordsRef = useRef(shuffle([...PLAYFUL_VERBS]));
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % wordsRef.current.length), 3000);
    return () => clearInterval(id);
  }, []);

  return <span className="pending-word">{wordsRef.current[i]}</span>;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Set when "restart chat" is pressed: excludes everything before this
  // moment from the parser's context/correction target, on top of the
  // server's own 15-minute staleness cutoff.
  const restartedAfterRef = useRef<string | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles]);

  // Auto-grow the composer as you type instead of scrolling long text
  // sideways inside a single fixed line, where you can't see the start of
  // what you typed.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [input]);

  function handleRestart() {
    restartedAfterRef.current = new Date().toISOString();
    setBubbles([]);
  }

  function sendMessage() {
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
        const result = await sendCaptureMessage(
          text,
          restartedAfterRef.current ? { after: restartedAfterRef.current } : undefined,
        );
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="card d1 flex flex-1 min-h-0 flex-col gap-3">
      <div className="chat-thread" ref={threadRef}>
        {bubbles.length === 0 && (
          <div className="chat-empty">
            <CactusIcon size={36} />
            <div className="chat-empty-text">{greeting}</div>
          </div>
        )}
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`bubble ${b.role} ${b.status !== "sent" ? b.status : ""}`.trim()}
          >
            {b.status === "pending" ? <PendingLabel /> : b.content}
            {b.flagged && <span className="flag">not sure about this one, reply to fix it up</span>}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="field"
          placeholder="log a task, note, expense..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          autoFocus
        />
        <button type="submit" className="sticker-btn primary" disabled={pending || !input.trim()}>
          send
        </button>
      </form>
      <button
        type="button"
        onClick={handleRestart}
        disabled={bubbles.length === 0}
        className="sub"
        style={{
          fontSize: 13,
          background: "none",
          border: "none",
          padding: 0,
          cursor: bubbles.length === 0 ? "default" : "pointer",
          opacity: bubbles.length === 0 ? 0.5 : 1,
        }}
      >
        restart chat
      </button>
    </div>
  );
}
