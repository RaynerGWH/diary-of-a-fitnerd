import { createClient } from "@/lib/supabase/server";
import type {
  FFClass,
  FFLocation,
  Profile,
  UUID,
  UserCard,
  Workout,
  WorkoutSet,
} from "./types";

export type WorkoutWithMeta = Workout & {
  profile: Pick<Profile, "id" | "display_name" | "email" | "color"> | null;
  location: Pick<FFLocation, "id" | "name"> | null;
  class: Pick<FFClass, "id" | "name" | "category"> | null;
  set_count: number;
  card_count: number;
};

const WORKOUT_SELECT = `
  *,
  profile:profiles!workouts_user_id_fkey ( id, display_name, email, color ),
  location:ff_locations ( id, name ),
  class:ff_classes ( id, name, category )
`;

async function decorateWorkouts(rows: unknown[]): Promise<WorkoutWithMeta[]> {
  const supabase = await createClient();
  const ids = (rows as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];

  const [{ data: setCounts }, { data: cardCounts }] = await Promise.all([
    supabase.from("workout_sets").select("workout_id").in("workout_id", ids),
    supabase.from("user_cards").select("workout_id").in("workout_id", ids),
  ]);

  const setMap = new Map<string, number>();
  for (const s of (setCounts as { workout_id: string }[] | null) ?? []) {
    setMap.set(s.workout_id, (setMap.get(s.workout_id) ?? 0) + 1);
  }
  const cardMap = new Map<string, number>();
  for (const c of (cardCounts as { workout_id: string }[] | null) ?? []) {
    if (!c.workout_id) continue;
    cardMap.set(c.workout_id, (cardMap.get(c.workout_id) ?? 0) + 1);
  }

  return (rows as WorkoutWithMeta[]).map((w) => ({
    ...w,
    set_count: setMap.get(w.id) ?? 0,
    card_count: cardMap.get(w.id) ?? 0,
  }));
}

export async function getActiveWorkouts(): Promise<WorkoutWithMeta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_SELECT)
    .eq("status", "active")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return decorateWorkouts(data ?? []);
}

export async function getRecentWorkouts(limit = 8): Promise<WorkoutWithMeta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_SELECT)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return decorateWorkouts(data ?? []);
}

export async function getWorkout(id: UUID): Promise<WorkoutWithMeta | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workouts")
    .select(WORKOUT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [decorated] = await decorateWorkouts([data]);
  return decorated;
}

export async function getWorkoutSets(workoutId: UUID): Promise<WorkoutSet[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", workoutId)
    .order("logged_at", { ascending: true });
  if (error) throw error;
  return (data as WorkoutSet[]) ?? [];
}

export type BlockRow = {
  id: UUID;
  workout_id: UUID;
  exercise_id: UUID | null;
  exercise_name: string;
  order_index: number;
  exercise: { image_urls: string[]; primary_muscle: string | null; equipment: string | null } | null;
};

export async function getWorkoutBlocks(workoutId: UUID): Promise<BlockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_exercises")
    .select("*, exercise:exercises ( image_urls, primary_muscle, equipment )")
    .eq("workout_id", workoutId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data as BlockRow[]) ?? [];
}

export async function getLocations(): Promise<FFLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ff_locations")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data as FFLocation[]) ?? [];
}

export async function getClasses(locationId?: UUID): Promise<FFClass[]> {
  const supabase = await createClient();
  let q = supabase.from("ff_classes").select("*");
  if (locationId) q = q.eq("location_id", locationId);
  const { data, error } = await q.order("day_of_week").order("start_time");
  if (error) throw error;
  return (data as FFClass[]) ?? [];
}

export async function getDeckCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("user_cards")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function getDeckPreview(limit = 3): Promise<UserCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select("*")
    .order("earned_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as UserCard[]) ?? [];
}

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*");
  if (error) throw error;
  return (data as Profile[]) ?? [];
}

export async function getWeeklySessionCount(userId: UUID): Promise<number> {
  const supabase = await createClient();
  const startOfWeek = new Date();
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("started_at", startOfWeek.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// Day-streak: consecutive calendar days (back from today) with at least one
// completed workout. Uses the user's *local* date.
export async function getDayStreak(userId: UUID): Promise<number> {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data, error } = await supabase
    .from("workouts")
    .select("started_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false });
  if (error) throw error;

  const days = new Set<string>();
  for (const row of (data as { started_at: string }[] | null) ?? []) {
    const d = new Date(row.started_at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Allow today to be empty (only break the streak if yesterday is empty too).
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        const yKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
        if (days.has(yKey)) {
          streak = 1;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }
  return streak;
}
