// Pure, dependency-free helpers for the exercise catalog. Tested in catalog.test.ts.

export const BODY_PARTS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

const MUSCLE_TO_BODY_PART: Record<string, BodyPart> = {
  chest: "Chest",
  lats: "Back",
  "middle back": "Back",
  "lower back": "Back",
  traps: "Back",
  shoulders: "Shoulders",
  neck: "Shoulders",
  biceps: "Arms",
  triceps: "Arms",
  forearms: "Arms",
  quadriceps: "Legs",
  hamstrings: "Legs",
  glutes: "Legs",
  calves: "Legs",
  abductors: "Legs",
  adductors: "Legs",
  abdominals: "Core",
};

export function muscleToBodyPart(muscle: string): BodyPart | null {
  return MUSCLE_TO_BODY_PART[muscle.toLowerCase().trim()] ?? null;
}

export function bodyPartsForExercise(primary: string[], secondary: string[] = []): BodyPart[] {
  const present = new Set<BodyPart>();
  for (const m of [...primary, ...secondary]) {
    const bp = muscleToBodyPart(m);
    if (bp) present.add(bp);
  }
  return BODY_PARTS.filter((bp) => present.has(bp));
}

export const IMAGE_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

export function imageUrl(path: string): string {
  return `${IMAGE_CDN_BASE}/${path}`;
}

export type DatasetExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string | null;
  images: string[];
};

export type ExerciseSeed = {
  slug: string;
  name: string;
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
};

export function mapDatasetEntry(e: DatasetExercise): ExerciseSeed {
  return {
    slug: e.id,
    name: e.name,
    category: e.category ?? null,
    primary_muscle: e.primaryMuscles?.[0] ?? null,
    primary_muscles: e.primaryMuscles ?? [],
    secondary_muscles: e.secondaryMuscles ?? [],
    equipment: e.equipment ?? null,
    force: e.force ?? null,
    level: e.level ?? null,
    mechanic: e.mechanic ?? null,
    instructions: e.instructions ?? [],
    image_urls: (e.images ?? []).map(imageUrl),
    is_custom: false,
  };
}

export function nextSetIndex(existingIndexes: number[]): number {
  return existingIndexes.length ? Math.max(...existingIndexes) + 1 : 1;
}
