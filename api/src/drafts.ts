// Drafts live in the real tables with status = 'draft' (see docs/database.md):
// a meal draft is a meals row + meal_items, a workout draft is workout_logs rows.
// Each is linked to the chat message that showed it. Save applies the user's edits
// and flips status to 'saved'; only saved rows count anywhere else.

import type { PoolClient } from "pg";
import { z } from "zod";
import type { WorkoutDraft } from "./agent/context";
import type { MealDraft, Per100g } from "./agent/mealDraft";
import { db } from "./db";
import { mealSlot } from "./time";

type Queryable = Pick<PoolClient, "query">;
type Status = "draft" | "saved";

/** What the app renders under a model message. */
export interface MealView {
  type: "meal";
  status: Status;
  mealType: string;
  items: {
    itemId: number;
    name: string;
    grams: number;
    source: "usda" | "estimated";
    fdcId: number | null;
    estimateBasis: string | null;
    per100g: Per100g;
    totals: Per100g;
  }[];
  totals: Per100g;
}

export interface WorkoutView {
  type: "workout";
  status: Status;
  entries: {
    logId: number;
    exerciseId: number;
    name: string;
    sets: number;
    reps: number;
    weight: number | null; // null = bodyweight
    unit: "lb" | "kg";
  }[];
}

export type DraftView = MealView | WorkoutView;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Stores the turn's draft, replacing the user's earlier unsaved draft of the same kind. */
export async function storeDraft(
  client: Queryable,
  args: {
    userId: number;
    messageId: number;
    rawText: string;
    timeZone: string;
    units: "lb" | "kg";
    draft: MealDraft | WorkoutDraft;
  },
) {
  const { userId, messageId, rawText, draft } = args;

  if (draft.type === "meal") {
    await client.query(`delete from meals where user_id = $1 and status = 'draft'`, [userId]);
    const meal = await client.query<{ meal_id: number }>(
      `insert into meals (user_id, meal_type, raw_text, chat_message_id) values ($1, $2, $3, $4) returning meal_id`,
      [userId, mealSlot(new Date(), args.timeZone).toLowerCase(), rawText, messageId],
    );
    for (const item of draft.items) {
      await client.query(
        `insert into meal_items (meal_id, name, grams, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
                                 source, fdc_id, estimate_basis)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          meal.rows[0].meal_id,
          item.name,
          round1(item.grams),
          round1(item.per100g.kcal),
          round1(item.per100g.protein_g),
          round1(item.per100g.carbs_g),
          round1(item.per100g.fat_g),
          item.source,
          item.fdcId ?? null,
          item.estimateBasis ?? null,
        ],
      );
    }
    return;
  }

  await client.query(`delete from workout_logs where user_id = $1 and status = 'draft'`, [userId]);
  for (const ex of draft.exercises) {
    const exerciseId = ex.exerciseId ? Number(ex.exerciseId) : await findOrCreateExercise(client, userId, ex.name);
    // workout_logs has one row per (sets x reps at weight); identical sets in a row are grouped.
    const groups: { sets: number; reps: number; weight: number }[] = [];
    for (const s of ex.sets) {
      const last = groups[groups.length - 1];
      if (last && last.reps === s.reps && last.weight === s.weight) last.sets++;
      else groups.push({ sets: 1, reps: s.reps, weight: s.weight });
    }
    for (const g of groups) {
      await client.query(
        `insert into workout_logs (user_id, exercise_id, sets, reps, weight, unit, raw_text, chat_message_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // The model sends 0 for bodyweight; the schema stores bodyweight as empty.
        [userId, exerciseId, g.sets, g.reps, g.weight > 0 ? g.weight : null, args.units, rawText, messageId],
      );
    }
  }
}

async function findOrCreateExercise(client: Queryable, userId: number, name: string): Promise<number> {
  // Built-in names win, so "bench press" doesn't become a second Bench Press (known issue 5).
  const existing = await client.query<{ exercise_id: number }>(
    `select exercise_id from exercises where (user_id is null or user_id = $1) and lower(name) = lower($2)
     order by user_id nulls first limit 1`,
    [userId, name],
  );
  if (existing.rows.length) return existing.rows[0].exercise_id;
  const created = await client.query<{ exercise_id: number }>(
    `insert into exercises (user_id, name) values ($1, $2) returning exercise_id`,
    [userId, name],
  );
  return created.rows[0].exercise_id;
}

/** Drafts (unsaved or saved) shown under the given messages, by message ID. */
export async function loadDraftViews(userId: number, messageIds: number[], q: Queryable = db) {
  const views = new Map<number, DraftView>();
  if (!messageIds.length) return views;

  const meals = await q.query(
    `select m.chat_message_id, m.status, m.meal_type, i.item_id, i.name, i.grams, i.source, i.fdc_id, i.estimate_basis,
            i.kcal_per_100g, i.protein_per_100g, i.carbs_per_100g, i.fat_per_100g, i.kcal, i.protein_g, i.carbs_g, i.fat_g
     from meals m join meal_items i using (meal_id)
     where m.user_id = $1 and m.chat_message_id = any($2)
     order by i.item_id`,
    [userId, messageIds],
  );
  for (const r of meals.rows) {
    let view = views.get(r.chat_message_id) as MealView | undefined;
    if (!view) {
      view = { type: "meal", status: r.status, mealType: r.meal_type, items: [], totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
      views.set(r.chat_message_id, view);
    }
    const totals = { kcal: Number(r.kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) };
    view.items.push({
      itemId: r.item_id,
      name: r.name,
      grams: Number(r.grams),
      source: r.source,
      fdcId: r.fdc_id,
      estimateBasis: r.estimate_basis,
      per100g: {
        kcal: Number(r.kcal_per_100g),
        protein_g: Number(r.protein_per_100g),
        carbs_g: Number(r.carbs_per_100g),
        fat_g: Number(r.fat_per_100g),
      },
      totals,
    });
  }
  // Sum unrounded item values, then round once (matches GET /v1/today).
  for (const view of views.values()) {
    if (view.type !== "meal") continue;
    const sum = (k: keyof Per100g) => view.items.reduce((t, i) => t + i.totals[k], 0);
    view.totals = { kcal: Math.round(sum("kcal")), protein_g: round1(sum("protein_g")), carbs_g: round1(sum("carbs_g")), fat_g: round1(sum("fat_g")) };
  }

  const workouts = await q.query(
    `select w.chat_message_id, w.status, w.log_id, w.exercise_id, e.name, w.sets, w.reps, w.weight, w.unit
     from workout_logs w join exercises e using (exercise_id)
     where w.user_id = $1 and w.chat_message_id = any($2)
     order by w.log_id`,
    [userId, messageIds],
  );
  for (const r of workouts.rows) {
    let view = views.get(r.chat_message_id) as WorkoutView | undefined;
    if (!view) {
      view = { type: "workout", status: r.status, entries: [] };
      views.set(r.chat_message_id, view);
    }
    view.entries.push({
      logId: r.log_id,
      exerciseId: r.exercise_id,
      name: r.name,
      sets: r.sets,
      reps: r.reps,
      weight: r.weight === null ? null : Number(r.weight),
      unit: r.unit,
    });
  }
  return views;
}

/** The user's latest unsaved draft, in the agent's shape, for the session context. */
export async function pendingDraftForAgent(userId: number): Promise<MealDraft | WorkoutDraft | null> {
  const latest = await db.query<{ chat_message_id: number }>(
    `select chat_message_id from (
       select chat_message_id, created_at from meals where user_id = $1 and status = 'draft'
       union all
       select chat_message_id, created_at from workout_logs where user_id = $1 and status = 'draft'
     ) d where chat_message_id is not null order by created_at desc limit 1`,
    [userId],
  );
  if (!latest.rows.length) return null;
  const view = (await loadDraftViews(userId, [latest.rows[0].chat_message_id])).get(latest.rows[0].chat_message_id);
  if (!view) return null;

  if (view.type === "meal") {
    return {
      type: "meal",
      items: view.items.map((i) => ({
        name: i.name,
        grams: i.grams,
        source: i.source,
        fdcId: i.fdcId ?? undefined,
        estimateBasis: i.estimateBasis ?? undefined,
        per100g: i.per100g,
        totals: i.totals,
      })),
      totals: view.totals,
    };
  }
  return {
    type: "workout",
    exercises: view.entries.map((e) => ({
      exerciseId: String(e.exerciseId),
      name: e.name,
      sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.weight ?? 0 })),
    })),
  };
}

/** Edits the user made before tapping Save. IDs must belong to the draft being saved. */
export const DraftEdits = z.object({
  items: z.array(z.object({ itemId: z.number().int(), grams: z.number().positive().max(3000) })).max(30).optional(),
  entries: z
    .array(
      z.object({
        logId: z.number().int(),
        sets: z.number().int().min(1).max(30),
        reps: z.number().int().min(1).max(100),
        weight: z.number().min(0).max(1500).nullable(),
      }),
    )
    .max(40)
    .optional(),
});

/**
 * Applies edits and marks the message's draft saved. Safe to repeat: an already
 * saved draft is returned unchanged. Returns null if the message has no draft.
 */
export async function saveDraft(userId: number, messageId: number, edits: z.infer<typeof DraftEdits>) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const current = (await loadDraftViews(userId, [messageId], client)).get(messageId);
    if (!current) {
      await client.query("rollback");
      return null;
    }
    if (current.status === "saved") {
      await client.query("rollback");
      return current;
    }

    if (current.type === "meal") {
      for (const e of edits.items ?? []) {
        // Totals are generated columns, so the database recomputes them from grams.
        await client.query(
          `update meal_items i set grams = $1 from meals m
           where i.item_id = $2 and i.meal_id = m.meal_id and m.user_id = $3 and m.chat_message_id = $4 and m.status = 'draft'`,
          [round1(e.grams), e.itemId, userId, messageId],
        );
      }
      await client.query(
        `update meals set status = 'saved', eaten_at = now() where user_id = $1 and chat_message_id = $2 and status = 'draft'`,
        [userId, messageId],
      );
    } else {
      for (const e of edits.entries ?? []) {
        await client.query(
          `update workout_logs set sets = $1, reps = $2, weight = $3
           where log_id = $4 and user_id = $5 and chat_message_id = $6 and status = 'draft'`,
          [e.sets, e.reps, e.weight && e.weight > 0 ? e.weight : null, e.logId, userId, messageId],
        );
      }
      await client.query(
        `update workout_logs set status = 'saved', performed_at = now()
         where user_id = $1 and chat_message_id = $2 and status = 'draft'`,
        [userId, messageId],
      );
    }

    const saved = (await loadDraftViews(userId, [messageId], client)).get(messageId)!;
    await client.query("commit");
    return saved;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
