// Read-only data for the home screen's side buttons: today's macros (left) and
// saved exercises (right). Only status = 'saved' rows count.
//
//   GET /v1/today?timeZone=America/Chicago
//   GET /v1/exercises?timeZone=America/Chicago

import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "./db";
import { formatClock, isValidTimeZone, mealSlot, relativeDay } from "./time";
import { currentUserId, loadUser, type UserSettings } from "./user";

const round1 = (n: number) => Math.round(n * 10) / 10;

function timeZoneFor(req: FastifyRequest, user: UserSettings): string {
  const tz = (req.query as { timeZone?: unknown }).timeZone;
  return isValidTimeZone(tz) ? tz : user.timeZone;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface LogRow {
  sets: number;
  reps: number;
  weight: number | null; // null = bodyweight
  unit: string;
}

/**
 * The last session of one exercise: "3 × 8 · 185 lb", or when its sets differ
 * (several rows), "3 sets · top 10 × bodyweight".
 */
export function describeSession(rows: LogRow[]): string {
  const load = (r: LogRow) => (r.weight === null ? "bodyweight" : `${r.weight} ${r.unit}`);
  if (rows.length === 1) return `${rows[0].sets} × ${rows[0].reps} · ${load(rows[0])}`;
  const heavier = (a: LogRow, b: LogRow) => (b.weight ?? 0) - (a.weight ?? 0) || b.reps - a.reps;
  const top = [...rows].sort(heavier)[0];
  return `${rows.reduce((n, r) => n + r.sets, 0)} sets · top ${top.reps} × ${load(top)}`;
}

export async function registerSummaryRoutes(app: FastifyInstance) {
  app.get("/v1/today", async (req) => {
    const userId = await currentUserId();
    const user = await loadUser(userId);
    const timeZone = timeZoneFor(req, user);

    const { rows } = await db.query(
      `select m.meal_id, m.meal_type, m.eaten_at, count(i.item_id)::int as item_count,
              coalesce(sum(i.kcal), 0) as kcal, coalesce(sum(i.protein_g), 0) as protein_g,
              coalesce(sum(i.carbs_g), 0) as carbs_g, coalesce(sum(i.fat_g), 0) as fat_g
       from meals m left join meal_items i using (meal_id)
       where m.user_id = $1 and m.status = 'saved'
         and (m.eaten_at at time zone $2)::date = (now() at time zone $2)::date
       group by m.meal_id order by m.eaten_at`,
      [userId, timeZone],
    );

    const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    for (const r of rows) {
      totals.kcal += Number(r.kcal);
      totals.protein_g += Number(r.protein_g);
      totals.carbs_g += Number(r.carbs_g);
      totals.fat_g += Number(r.fat_g);
    }

    const meals = rows.map((r) => ({
      id: r.meal_id,
      name: capitalize(r.meal_type),
      time: formatClock(r.eaten_at, timeZone),
      itemCount: r.item_count,
      kcal: Math.round(Number(r.kcal)),
    }));
    const currentSlot = mealSlot(new Date(), timeZone);

    return {
      goals: user.goals,
      totals: {
        kcal: Math.round(totals.kcal),
        protein_g: round1(totals.protein_g),
        carbs_g: round1(totals.carbs_g),
        fat_g: round1(totals.fat_g),
      },
      meals,
      // The meal the user would log now, if it isn't logged yet ("Lunch not logged yet").
      nextMeal: meals.some((m) => m.name === currentSlot) ? null : currentSlot,
    };
  });

  app.get("/v1/exercises", async (req) => {
    const userId = await currentUserId();
    const user = await loadUser(userId);
    const timeZone = timeZoneFor(req, user);

    // Every exercise the user has saved, with its most recent session ("Last: 3 × 8 · 185 lb").
    // A session is the rows saved from one chat draft (several when the sets differ).
    const { rows } = await db.query(
      `with latest as (
         select distinct on (exercise_id) exercise_id, chat_message_id, performed_at
         from workout_logs where user_id = $1 and status = 'saved'
         order by exercise_id, performed_at desc, log_id desc
       )
       select e.exercise_id, e.name, e.category, l.performed_at,
              json_agg(json_build_object('sets', w.sets, 'reps', w.reps, 'weight', w.weight, 'unit', w.unit) order by w.log_id) as rows
       from latest l
       join exercises e on e.exercise_id = l.exercise_id
       join workout_logs w on w.user_id = $1 and w.status = 'saved' and w.exercise_id = l.exercise_id
         and (w.chat_message_id = l.chat_message_id or (l.chat_message_id is null and w.performed_at = l.performed_at))
       group by e.exercise_id, e.name, e.category, l.performed_at
       order by l.performed_at desc`,
      [userId],
    );

    return {
      exercises: rows.map((r) => ({
        exerciseId: r.exercise_id,
        name: r.name,
        category: r.category,
        last: describeSession(r.rows),
        when: relativeDay(r.performed_at, timeZone),
      })),
    };
  });
}
