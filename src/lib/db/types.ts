export type UUID = string;

export type Profile = {
  id: UUID;
  email: string;
  display_name: string | null;
  color: string | null;
  created_at: string;
};

export type FFLocation = {
  id: UUID;
  name: string;
  created_at: string;
};

export type FFClass = {
  id: UUID;
  location_id: UUID;
  name: string;
  category: string | null;
  intensity: number | null;
  instructor: string | null;
  day_of_week: number | null;
  start_time: string | null;
  duration_min: number | null;
  created_at: string;
};

export type Exercise = {
  id: UUID;
  name: string;
  slug: string | null;
  category: string | null;
  primary_muscle: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  instructions: string[];
  image_urls: string[];
  is_custom: boolean;
  created_at: string;
};

export type WorkoutStatus = "active" | "completed" | "abandoned";
export type WorkoutType = "strength" | "class" | "cardio" | "other";

export type Workout = {
  id: UUID;
  user_id: UUID;
  type: WorkoutType;
  location_id: UUID | null;
  class_id: UUID | null;
  title: string | null;
  status: WorkoutStatus;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  enjoyment: number | null;
  mood: string | null;
  notes: string | null;
  created_at: string;
};

export type WorkoutExercise = {
  id: UUID;
  workout_id: UUID;
  exercise_id: UUID | null;
  exercise_name: string;
  order_index: number;
  created_at: string;
};

export type WorkoutSet = {
  id: UUID;
  workout_id: UUID;
  workout_exercise_id: UUID | null;
  exercise_id: UUID | null;
  exercise_name: string;
  set_index: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  logged_at: string;
};

export type CardRarity = "common" | "rare" | "epic" | "legendary";

export type CardDef = {
  id: UUID;
  code: string;
  title: string;
  flavor: string | null;
  rarity: CardRarity;
  trigger: string | null;
  art_key: string | null;
};

export type UserCard = {
  id: UUID;
  user_id: UUID;
  card_def_id: UUID | null;
  workout_id: UUID | null;
  title: string;
  flavor: string | null;
  rarity: CardRarity;
  earned_at: string;
};
