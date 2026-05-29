"use client";

import { useState, useTransition } from "react";
import { finishWorkout, type FinishResult } from "./actions";
import { CardReveal, type RevealCard } from "@/components/CardReveal";

const MOODS = [
  { code: "strong", label: "felt strong 💪" },
  { code: "energised", label: "energised ⚡" },
  { code: "ok", label: "felt ok 🙂" },
  { code: "flat", label: "flat 😐" },
  { code: "wiped", label: "wiped 😮‍💨" },
];

export function EndForm({ workoutId }: { workoutId: string }) {
  const [enjoyment, setEnjoyment] = useState<number>(0);
  const [mood, setMood] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [reveal, setReveal] = useState<RevealCard | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    if (!enjoyment || !mood) return;
    const fd = new FormData();
    fd.set("workoutId", workoutId);
    fd.set("enjoyment", String(enjoyment));
    fd.set("mood", mood);
    fd.set("notes", notes);
    start(async () => {
      const result: FinishResult = await finishWorkout(fd);
      setReveal(result ? { title: result.title, flavor: result.flavor, rarity: result.rarity } : null);
      setDone(true);
    });
  }

  if (done) return <CardReveal card={reveal} />;

  return (
    <>
      <div className="card d1">
        <div className="font-bold text-[19px]">how was it?</div>
        <div className="sub" style={{ marginTop: 2 }}>this is the recsys signal — be honest</div>

        <div className="mt-3">
          <div className="text-[13px] text-[color:var(--muted)] mb-1">enjoyment</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEnjoyment(n)}
                className="chip"
                style={
                  enjoyment >= n
                    ? { background: "var(--hi)", borderColor: "var(--ink)", fontWeight: 700, fontSize: 16, padding: "4px 10px" }
                    : { fontSize: 16, padding: "4px 10px" }
                }
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[13px] text-[color:var(--muted)] mb-1">mood / energy</div>
          <div className="chips">
            {MOODS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => setMood(m.code)}
                className="chip"
                style={mood === m.code ? { background: "var(--rayner)", color: "#fff" } : undefined}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[13px] text-[color:var(--muted)] mb-1">notes (optional)</div>
          <input
            className="field"
            placeholder="anything to remember..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <button
        className="card start-hero d2"
        type="button"
        onClick={submit}
        disabled={pending || !enjoyment || !mood}
        style={{ border: "none" }}
      >
        <div className="big">{pending ? "saving…" : "finish + flip a card"}</div>
        <div className="hint">enjoyment + mood get logged forever</div>
      </button>
    </>
  );
}
