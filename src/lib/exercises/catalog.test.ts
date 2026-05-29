import { describe, it, expect } from "vitest";
import {
  muscleToBodyPart,
  bodyPartsForExercise,
  imageUrl,
  mapDatasetEntry,
  nextSetIndex,
  BODY_PARTS,
  type DatasetExercise,
} from "./catalog";

describe("muscleToBodyPart", () => {
  it("maps fine-grained muscles to body parts", () => {
    expect(muscleToBodyPart("chest")).toBe("Chest");
    expect(muscleToBodyPart("lats")).toBe("Back");
    expect(muscleToBodyPart("middle back")).toBe("Back");
    expect(muscleToBodyPart("biceps")).toBe("Arms");
    expect(muscleToBodyPart("quadriceps")).toBe("Legs");
    expect(muscleToBodyPart("abdominals")).toBe("Core");
    expect(muscleToBodyPart("shoulders")).toBe("Shoulders");
  });

  it("is case/space insensitive", () => {
    expect(muscleToBodyPart("  Chest ")).toBe("Chest");
    expect(muscleToBodyPart("LATS")).toBe("Back");
  });

  it("returns null for unknown muscles", () => {
    expect(muscleToBodyPart("spleen")).toBeNull();
  });
});

describe("bodyPartsForExercise", () => {
  it("combines primary + secondary, dedupes, keeps canonical order", () => {
    // bench press: primary chest, secondary shoulders+triceps
    expect(bodyPartsForExercise(["chest"], ["shoulders", "triceps"])).toEqual([
      "Chest",
      "Shoulders",
      "Arms",
    ]);
  });

  it("dedupes when multiple muscles map to one part", () => {
    expect(bodyPartsForExercise(["biceps", "triceps", "forearms"])).toEqual(["Arms"]);
  });

  it("orders results by the canonical BODY_PARTS order", () => {
    const result = bodyPartsForExercise(["abdominals", "chest"]);
    expect(result).toEqual(["Chest", "Core"]);
    // sanity: Chest precedes Core in the canon
    expect(BODY_PARTS.indexOf("Chest")).toBeLessThan(BODY_PARTS.indexOf("Core"));
  });
});

describe("imageUrl", () => {
  it("prefixes the jsDelivr CDN base", () => {
    expect(imageUrl("3_4_Sit-Up/0.jpg")).toBe(
      "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/3_4_Sit-Up/0.jpg",
    );
  });
});

describe("mapDatasetEntry", () => {
  const entry: DatasetExercise = {
    id: "Barbell_Bench_Press_-_Medium_Grip",
    name: "Barbell Bench Press - Medium Grip",
    force: "push",
    level: "beginner",
    mechanic: "compound",
    equipment: "barbell",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["shoulders", "triceps"],
    instructions: ["Lie back.", "Press up."],
    category: "strength",
    images: ["Barbell_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Bench_Press_-_Medium_Grip/1.jpg"],
  };

  it("maps a dataset entry to an upsertable row", () => {
    const row = mapDatasetEntry(entry);
    expect(row.slug).toBe("Barbell_Bench_Press_-_Medium_Grip");
    expect(row.name).toBe("Barbell Bench Press - Medium Grip");
    expect(row.primary_muscle).toBe("chest");
    expect(row.primary_muscles).toEqual(["chest"]);
    expect(row.secondary_muscles).toEqual(["shoulders", "triceps"]);
    expect(row.equipment).toBe("barbell");
    expect(row.is_custom).toBe(false);
    expect(row.image_urls).toEqual([
      "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
      "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg",
    ]);
  });

  it("tolerates missing optional arrays", () => {
    const sparse = { ...entry, primaryMuscles: [], secondaryMuscles: [], images: [], instructions: [] };
    const row = mapDatasetEntry(sparse);
    expect(row.primary_muscle).toBeNull();
    expect(row.image_urls).toEqual([]);
  });
});

describe("nextSetIndex", () => {
  it("starts at 1 for an empty block", () => {
    expect(nextSetIndex([])).toBe(1);
  });
  it("is one past the current max", () => {
    expect(nextSetIndex([1, 2])).toBe(3);
    expect(nextSetIndex([3, 1, 2])).toBe(4);
  });
});
