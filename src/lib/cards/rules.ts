import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardDef, CardRarity, UUID } from "@/lib/db/types";

export type EarnedCard = {
  card_def_id: UUID | null;
  title: string;
  flavor: string | null;
  rarity: CardRarity;
};

type Candidate = EarnedCard & { code: string };

const RARITY_WEIGHT: Record<CardRarity, number> = {
  common: 4,
  rare: 6,
  epic: 8,
  legendary: 12,
};

/**
 * Decide which card (if any) the user earns for finishing this workout.
 * Runs the full rule set, then picks the rarest qualifying card (with weight
 * tiebreak). Returns null if nothing fires (rare — first_session catches new users).
 */
export async function pickCardForWorkout(
  supabase: SupabaseClient,
  ctx: { workoutId: UUID; userId: UUID },
): Promise<EarnedCard | null> {
  const [defs, signals] = await Promise.all([
    fetchCardDefs(supabase),
    gatherSignals(supabase, ctx),
  ]);

  const candidates: Candidate[] = [];
  for (const check of RULES) {
    const code = check(signals);
    if (!code) continue;
    const def = defs[code];
    if (!def) continue;
    candidates.push({
      code,
      card_def_id: def.id,
      title: def.title,
      flavor: def.flavor ?? null,
      rarity: def.rarity,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => RARITY_WEIGHT[b.rarity] - RARITY_WEIGHT[a.rarity]);
  return candidates[0];
}

async function fetchCardDefs(supabase: SupabaseClient): Promise<Record<string, CardDef>> {
  const { data } = await supabase.from("card_defs").select("*");
  const map: Record<string, CardDef> = {};
  for (const d of (data as CardDef[] | null) ?? []) map[d.code] = d;
  return map;
}

type Signals = {
  isFirstEverSession: boolean;
  isFirstClassOfThisType: boolean;
  daysStreak: number;
  partnerTrainedToday: boolean;
  totalTonnageKg: number;
  prLifts: { name: string; weight: number }[];
};

async function gatherSignals(
  supabase: SupabaseClient,
  ctx: { workoutId: UUID; userId: UUID },
): Promise<Signals> {
  // Pull the workout we just finished + its sets.
  const [{ data: thisWorkout }, { data: thisSets }] = await Promise.all([
    supabase
      .from("workouts")
      .select("id, user_id, started_at, ended_at, class_id, ff_classes(category)")
      .eq("id", ctx.workoutId)
      .maybeSingle(),
    supabase
      .from("workout_sets")
      .select("exercise_name, reps, weight")
      .eq("workout_id", ctx.workoutId),
  ]);

  // First-ever completed session by this user (other than the one we just finished).
  const { count: priorCompletedCount } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .eq("status", "completed")
    .neq("id", ctx.workoutId);
  const isFirstEverSession = (priorCompletedCount ?? 0) === 0;

  // First class of this category for this user.
  let isFirstClassOfThisType = false;
  const thisCategory =
    (thisWorkout as { ff_classes?: { category?: string | null } | null } | null)?.ff_classes?.category ?? null;
  if (thisCategory) {
    const { count } = await supabase
      .from("workouts")
      .select("ff_classes!inner(category)", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("status", "completed")
      .eq("ff_classes.category", thisCategory)
      .neq("id", ctx.workoutId);
    isFirstClassOfThisType = (count ?? 0) === 0;
  }

  // Day-streak: consecutive days back from today with a completed session.
  const daysStreak = await computeStreak(supabase, ctx.userId);

  // Partner trained today (any other user finished a session today).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: partnerCount } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .neq("user_id", ctx.userId)
    .eq("status", "completed")
    .gte("started_at", startOfDay.toISOString());
  const partnerTrainedToday = (partnerCount ?? 0) > 0;

  // Tonnage = sum(reps * weight) across this session.
  let totalTonnageKg = 0;
  const exerciseBest = new Map<string, number>();
  for (const s of (thisSets as { exercise_name: string; reps: number | null; weight: number | null }[] | null) ?? []) {
    if (s.reps && s.weight) totalTonnageKg += s.reps * s.weight;
    if (s.weight != null) {
      const prev = exerciseBest.get(s.exercise_name) ?? 0;
      if (s.weight > prev) exerciseBest.set(s.exercise_name, s.weight);
    }
  }

  // PR detection: top weight per exercise in this session vs all prior sessions of this user.
  const prLifts: { name: string; weight: number }[] = [];
  for (const [name, bestNow] of exerciseBest) {
    const { data: priorMax } = await supabase
      .from("workout_sets")
      .select("weight, workouts!inner(user_id, id)")
      .eq("exercise_name", name)
      .eq("workouts.user_id", ctx.userId)
      .neq("workouts.id", ctx.workoutId)
      .order("weight", { ascending: false })
      .limit(1);
    const prevTop = (priorMax as { weight: number | null }[] | null)?.[0]?.weight ?? 0;
    if (bestNow > (prevTop ?? 0)) prLifts.push({ name, weight: bestNow });
  }

  return {
    isFirstEverSession,
    isFirstClassOfThisType,
    daysStreak,
    partnerTrainedToday,
    totalTonnageKg,
    prLifts,
  };
}

async function computeStreak(supabase: SupabaseClient, userId: UUID): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data } = await supabase
    .from("workouts")
    .select("started_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("started_at", since.toISOString());
  const days = new Set<string>();
  for (const r of (data as { started_at: string }[] | null) ?? []) {
    const d = new Date(r.started_at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

// Tonnage tiers in kg.
const TONNAGE_THRESHOLD = 2000;

const RULES: Array<(s: Signals) => string | null> = [
  // Order doesn't matter — the rarest qualifier wins. Codes match schema.sql.
  (s) => (s.isFirstEverSession ? "first_session" : null),
  (s) => (s.prLifts.length > 0 ? "pr_lift" : null),
  (s) => (s.daysStreak >= 30 ? "legend_30" : null),
  (s) => (s.daysStreak >= 7 ? "streak_7" : null),
  (s) => (s.isFirstClassOfThisType ? "first_class" : null),
  (s) => (s.partnerTrainedToday ? "together" : null),
  (s) => (s.totalTonnageKg >= TONNAGE_THRESHOLD ? "tonnage" : null),
];
