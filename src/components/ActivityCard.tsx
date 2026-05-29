import type { WorkoutWithMeta } from "@/lib/db/queries";
import { formatRelative, ownerInitial } from "@/lib/format";

const MOOD_LABEL: Record<string, string> = {
  strong: "felt strong",
  wiped: "wiped out 😮‍💨",
  energised: "energised",
  ok: "felt ok",
  flat: "flat",
};

export function ActivityCard({
  workout,
  variant = "alt",
  delayClass,
}: {
  workout: WorkoutWithMeta;
  variant?: "default" | "alt";
  delayClass?: string;
}) {
  const isAda = workout.profile?.color === "#ef5a6b" ||
    (workout.profile?.email?.toLowerCase().startsWith("ada") ?? false);
  const initial = ownerInitial(workout.profile?.display_name ?? null, workout.profile?.email ?? "?");
  const title = workout.title ?? workout.class?.name ?? "Workout";
  const locName = workout.location?.name ?? (workout.type === "strength" ? "strength" : workout.type);
  const when = formatRelative(workout.started_at);

  let detail = `${locName} · ${when}`;
  if (workout.set_count > 0) detail += ` · ${workout.set_count} sets`;
  else if (workout.duration_sec) detail += ` · ${Math.round(workout.duration_sec / 60)} min`;

  return (
    <div className={`card ${variant === "alt" ? "alt" : ""} ${delayClass ?? ""}`}>
      <div className="act">
        <div className={`tag ${isAda ? "a" : "r"}`}>{initial}</div>
        <div>
          <div className="t">{title}</div>
          <div className="d">{detail}</div>
          <div className="chips">
            {workout.enjoyment != null && (
              <span className="chip">enjoyed {workout.enjoyment}/5</span>
            )}
            {workout.mood && (
              <span className="chip">{MOOD_LABEL[workout.mood] ?? workout.mood}</span>
            )}
            {workout.card_count > 0 && (
              <span className="chip card-chip">🃏 {workout.card_count === 1 ? "new card" : `${workout.card_count} cards`}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
