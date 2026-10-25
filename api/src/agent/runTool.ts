// Runs one Gemini functionCall for the current user. Every query is scoped to
// ctx.userId; the model never supplies a user ID. Tools never write logs: a draft
// is only kept in ctx and stored by the chat route after the turn.

import { db } from "../db";
import type { Goals } from "../user";
import type { WorkoutDraft } from "./context";
import { buildMealDraft, DraftValidationError, type MealDraft } from "./mealDraft";
import { ToolArgs, type ToolName } from "./tools";
import { lookupFood, searchFoods } from "./usda";
import { buildWorkoutDraft } from "./workoutDraft";

export interface ToolContext {
  userId: number;
  timeZone: string;
  goals: Goals;
  seenFdcIds: Set<number>; // fdcIds returned by search_foods during this turn
  draft: MealDraft | WorkoutDraft | null; // latest draft built during this turn
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
  if (!(name in ToolArgs)) return { error: `Unknown tool ${name}` };
  try {
    return await run(name as ToolName, rawArgs ?? {}, ctx);
  } catch (err) {
    if (err instanceof DraftValidationError) return { error: err.message };
    throw err;
  }
}

async function run(name: ToolName, rawArgs: unknown, ctx: ToolContext): Promise<Record<string, unknown>> {
  switch (name) {
    case "search_foods": {
      const args = ToolArgs.search_foods.safeParse(rawArgs);
      if (!args.success) return { error: "query is required" };
      const results = await searchFoods(args.data.query);
      results.forEach((r) => ctx.seenFdcIds.add(r.fdcId));
      return { results };
    }

    case "find_exercise": {
      const args = ToolArgs.find_exercise.safeParse(rawArgs);
      if (!args.success) return { error: "name is required" };
      const q = args.data.name.trim().toLowerCase();
      // Built-in and the user's own exercises; exact names first.
      const { rows } = await db.query(
        `select exercise_id, name, category from exercises
         where (user_id is null or user_id = $1)
           and (lower(name) like '%' || $2 || '%' or $2 like '%' || lower(name) || '%')
         order by (lower(name) = $2) desc, user_id nulls first, length(name)
         limit 5`,
        [ctx.userId, q],
      );
      return {
        matches: rows.map((r) => ({ exerciseId: String(r.exercise_id), name: r.name, category: r.category })),
      };
    }

    case "draft_meal": {
      ctx.draft = await buildMealDraft(rawArgs, ctx.seenFdcIds, lookupFood);
      return { draft: ctx.draft };
    }

    case "draft_workout": {
      ctx.draft = await buildWorkoutDraft(rawArgs, ctx.userId);
      return { draft: ctx.draft };
    }

    case "get_nutrition_summary": {
      const args = ToolArgs.get_nutrition_summary.safeParse(rawArgs);
      const days = args.success ? args.data.days : 7;
      const { rows } = await db.query(
        `select (m.eaten_at at time zone $2)::date::text as day,
                sum(i.kcal) as kcal, sum(i.protein_g) as protein_g, sum(i.carbs_g) as carbs_g, sum(i.fat_g) as fat_g
         from meals m join meal_items i using (meal_id)
         where m.user_id = $1 and m.status = 'saved' and m.eaten_at >= now() - make_interval(days => $3)
         group by 1 order by 1`,
        [ctx.userId, ctx.timeZone, days],
      );
      const perDay = rows.map((r) => ({
        day: r.day,
        kcal: Math.round(num(r.kcal)),
        protein_g: round1(num(r.protein_g)),
        carbs_g: round1(num(r.carbs_g)),
        fat_g: round1(num(r.fat_g)),
      }));
      const avg = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g") =>
        perDay.length ? round1(perDay.reduce((s, d) => s + d[k], 0) / perDay.length) : 0;
      return {
        days,
        daysLogged: perDay.length,
        averagePerLoggedDay: { kcal: avg("kcal"), protein_g: avg("protein_g"), carbs_g: avg("carbs_g"), fat_g: avg("fat_g") },
        goals: ctx.goals,
        perDay,
      };
    }

    case "get_progress": {
      const args = ToolArgs.get_progress.safeParse(rawArgs);
      if (!args.success || !/^\d+$/.test(args.data.exerciseId)) return { error: "exerciseId from find_exercise is required" };
      const { rows } = await db.query(
        `select date_trunc('week', performed_at at time zone $3)::date::text as week_of,
                max(weight) as best_weight,
                (array_agg(reps order by weight desc nulls last, reps desc))[1] as best_reps,
                sum(sets * reps * coalesce(weight, 0)) as volume,
                sum(sets) as sets,
                min(unit::text) as unit
         from workout_logs
         where user_id = $1 and exercise_id = $2 and status = 'saved'
           and performed_at >= now() - make_interval(weeks => $4)
         group by 1 order by 1`,
        [ctx.userId, Number(args.data.exerciseId), ctx.timeZone, args.data.weeks],
      );
      return {
        weeks: rows.map((r) => ({
          weekOf: r.week_of,
          bestSet: { weight: r.best_weight === null ? "bodyweight" : num(r.best_weight), reps: num(r.best_reps) },
          volume: Math.round(num(r.volume)),
          sets: num(r.sets),
          unit: r.unit,
        })),
      };
    }
  }
}
