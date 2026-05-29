"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BODY_PARTS,
  bodyPartsForExercise,
  type BodyPart,
} from "@/lib/exercises/catalog";
import { addExerciseToWorkout, createCustomAndAdd } from "@/app/workout/[id]/actions";

type PickerExercise = {
  id: string;
  name: string;
  primary_muscle: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  image_urls: string[];
};

const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "kettlebells",
  "body only", "bands", "e-z curl bar", "medicine ball", "exercise ball",
];

export function ExercisePicker({
  workoutId,
  onClose,
}: {
  workoutId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [all, setAll] = useState<PickerExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState<BodyPart | "All">("All");
  const [equipment, setEquipment] = useState<string>("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [showCustom, setShowCustom] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("exercises")
      .select("id, name, primary_muscle, primary_muscles, secondary_muscles, equipment, image_urls")
      .order("name")
      .limit(2000)
      .then(({ data }) => {
        setAll((data as PickerExercise[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (equipment && (e.equipment ?? "") !== equipment) return false;
      if (bodyPart !== "All") {
        const parts = bodyPartsForExercise(e.primary_muscles ?? [], e.secondary_muscles ?? []);
        if (!parts.includes(bodyPart)) return false;
      }
      return true;
    });
  }, [all, query, bodyPart, equipment]);

  function add(e: PickerExercise) {
    start(async () => {
      await addExerciseToWorkout(workoutId, e.id, e.name);
      setAddedIds((prev) => new Set(prev).add(e.id));
      router.refresh();
    });
  }

  return (
    <div className="picker-overlay">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-[19px]">add exercise</div>
        <button className="sticker-btn" onClick={onClose}>done</button>
      </div>

      <input
        className="field"
        placeholder="🔍 search exercises…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="chips mt-2">
        <button
          className="chip"
          style={bodyPart === "All" ? activeChip : undefined}
          onClick={() => setBodyPart("All")}
        >
          All
        </button>
        {BODY_PARTS.map((bp) => (
          <button
            key={bp}
            className="chip"
            style={bodyPart === bp ? activeChip : undefined}
            onClick={() => setBodyPart(bp)}
          >
            {bp}
          </button>
        ))}
      </div>

      <select className="field mt-2" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
        <option value="">any equipment</option>
        {EQUIPMENT.map((eq) => (
          <option key={eq} value={eq}>{eq}</option>
        ))}
      </select>

      <div className="picker-list mt-3">
        {loading ? (
          <div className="text-[14px] text-[color:var(--muted)]">loading library…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[14px] text-[color:var(--muted)]">
            nothing matches — try the custom add below.
          </div>
        ) : (
          filtered.slice(0, 80).map((e) => (
            <div key={e.id} className="picker-row">
              <Thumb url={e.image_urls?.[0]} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] truncate">{e.name}</div>
                <div className="text-[10.5px] text-[color:var(--muted)]">
                  {e.primary_muscle ?? "—"}{e.equipment ? ` · ${e.equipment}` : ""}
                </div>
              </div>
              <button
                className="picker-add"
                disabled={pending}
                onClick={() => add(e)}
                aria-label={`add ${e.name}`}
              >
                {addedIds.has(e.id) ? "✓" : "+"}
              </button>
            </div>
          ))
        )}
        {!loading && filtered.length > 80 && (
          <div className="text-[11px] text-[color:var(--muted)] text-center mt-1">
            showing first 80 — keep typing to narrow it down
          </div>
        )}
      </div>

      <div className="mt-3">
        {showCustom ? (
          <CustomForm
            workoutId={workoutId}
            pending={pending}
            onSubmit={(name, muscle, eq) =>
              start(async () => {
                await createCustomAndAdd(workoutId, name, muscle, eq);
                router.refresh();
                setShowCustom(false);
              })
            }
          />
        ) : (
          <button
            className="w-full text-[12px] text-[color:var(--muted)] border-[1.5px] border-dashed border-[color:var(--muted)] rounded-[8px] py-2"
            onClick={() => setShowCustom(true)}
          >
            ＋ can&apos;t find it? create a custom exercise
          </button>
        )}
      </div>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (!url) {
    return <div className="picker-thumb picker-thumb-empty">FN</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="picker-thumb" src={url} alt="" loading="lazy" />;
}

function CustomForm({
  pending,
  onSubmit,
}: {
  workoutId: string;
  pending: boolean;
  onSubmit: (name: string, muscle: string | null, equipment: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [eq, setEq] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <input className="field" placeholder="exercise name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <input className="field" placeholder="muscle (optional)" value={muscle} onChange={(e) => setMuscle(e.target.value)} />
        <input className="field" placeholder="equipment (optional)" value={eq} onChange={(e) => setEq(e.target.value)} />
      </div>
      <button
        className="sticker-btn primary"
        disabled={pending || !name.trim()}
        onClick={() => onSubmit(name.trim(), muscle.trim() || null, eq.trim() || null)}
      >
        add custom exercise
      </button>
    </div>
  );
}

const activeChip: React.CSSProperties = {
  background: "var(--rayner)",
  color: "#fff",
  borderColor: "var(--ink)",
  fontWeight: 700,
};
