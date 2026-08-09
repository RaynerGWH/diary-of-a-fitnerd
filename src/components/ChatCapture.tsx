"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shuffle } from "animejs";
import { sendCaptureMessage, type PendingEdit } from "@/app/capture/chat-actions";
import { updateEntry, createEntryFromFields } from "@/app/entries/actions";
import { CactusIcon } from "./Doodle";
import { EntryEditForm, formFromEntryLike, fieldsFromForm, type EditForm } from "./EntryEditForm";
import type { ChatMessage } from "@/lib/db/types";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "sent" | "pending" | "failed";
  flagged?: boolean;
  pendingEdit?: PendingEdit;
  pendingResolution?: "applied" | "cancelled";
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

// Edits never auto-apply (see chat-actions.ts): this renders the LLM's
// proposal as an editable form, prefilled, so the user can confirm as-is,
// tweak anything first, or cancel outright rather than trusting a
// confidently-wrong match.
function PendingEditCard({
  pending,
  onResolved,
}: {
  pending: PendingEdit;
  onResolved: (result: "applied" | "cancelled") => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditForm>(() =>
    formFromEntryLike({
      type: pending.fields.type,
      category: pending.fields.category,
      title: pending.fields.title,
      body: pending.fields.body,
      due_at: pending.fields.dueAt,
      amount: pending.fields.amount,
      currency: pending.fields.currency,
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSaving(true);
    setError(null);
    try {
      const fields = fieldsFromForm(form);
      if (pending.kind === "edit") {
        await updateEntry(pending.entryId, {
          ...fields,
          title: fields.title || pending.currentTitle,
          status: pending.fields.status,
        });
      } else {
        await createEntryFromFields({ ...fields, title: fields.title || "untitled" });
      }
      router.refresh();
      onResolved("applied");
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't save that, try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pending-edit-card">
      <div className="pending-edit-label">
        {pending.kind === "edit" ? `editing: ${pending.currentTitle}` : "log as new entry?"}
      </div>
      <EntryEditForm form={form} onChange={setForm} />
      {error && <div className="text-[13px] text-[color:var(--urgent)]">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          className="sticker-btn primary"
          onClick={onConfirm}
          disabled={saving || !form.title.trim()}
        >
          {saving ? "saving..." : pending.kind === "edit" ? "confirm edit" : "log as new"}
        </button>
        <button
          type="button"
          className="sticker-btn"
          onClick={() => onResolved("cancelled")}
          disabled={saving}
        >
          cancel
        </button>
      </div>
    </div>
  );
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
  // moment from the parser's context, on top of the server's own 15-minute
  // staleness cutoff.
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

  function resolvePendingEdit(bubbleId: string, result: "applied" | "cancelled") {
    setBubbles((prev) =>
      prev.map((b) => (b.id === bubbleId ? { ...b, pendingResolution: result } : b)),
    );
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
                  flagged: result.status === "applied" ? result.flagged : false,
                  pendingEdit: result.status === "pending" ? result.pending : undefined,
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
            {b.pendingEdit && !b.pendingResolution && (
              <PendingEditCard pending={b.pendingEdit} onResolved={(r) => resolvePendingEdit(b.id, r)} />
            )}
            {b.pendingResolution === "cancelled" && <span className="pending-cancelled">cancelled</span>}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="field"
          placeholder="type thoughts here..."
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
        className="restart-chat-btn"
      >
        restart chat
      </button>
    </div>
  );
}
