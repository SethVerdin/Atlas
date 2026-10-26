// Turns validated draft_workout arguments into a draft the app can render.
// An exerciseId counts only if it exists in the catalog for this user; otherwise
// it is dropped and the exercise is matched or created by name when the draft is stored.

import { db } from "../db";
import type { WorkoutDraft } from "./context";
import { DraftValidationError } from "./mealDraft";
import { ToolArgs } from "./tools";

export async function buildWorkoutDraft(args: unknown, userId: number): Promise<WorkoutDraft> {
  const parsed = ToolArgs.draft_workout.safeParse(args);
  if (!parsed.success) {
    throw new DraftValidationError(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const exercises: WorkoutDraft["exercises"] = [];
  for (const ex of parsed.data.exercises) {
    let exerciseId: string | undefined;
    let name = ex.name;
    if (ex.exerciseId && /^\d+$/.test(ex.exerciseId)) {
      const { rows } = await db.query(
        "select exercise_id, name from exercises where exercise_id = $1 and (user_id is null or user_id = $2)",
        [Number(ex.exerciseId), userId],
      );
      if (rows.length) {
        exerciseId = String(rows[0].exercise_id);
        name = rows[0].name;
      }
    }
    exercises.push({ exerciseId, name, sets: ex.sets });
  }
  return { type: "workout", exercises };
}
