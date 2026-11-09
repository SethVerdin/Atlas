// Data for progress charts. Only status = 'saved' rows count.
//
//   GET /v1/progress?days=7&timeZone=America/Chicago     (days: 7 or 30, default 7)
//
// Covers the last `days` calendar days in the user's time zone, today included:
// - nutrition: every day's calorie and macro totals (zeros when nothing was saved),
//   to compare with `goals` (the user's current goals; there is no goal history yet)
// - exercises: for each exercise trained in that window, its top weight on each day
//   it was trained, in the user's unit

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { isValidTimeZone } from "./time";
import { currentUserId, loadUser } from "./user";

const Query = z.object({
  days: z.enum(["7", "30"]).default("7"),
  timeZone: z.string().optional(),
});

const LB_PER_KG = 2.20462;
const round1 = (n: number) => Math.round(n * 10) / 10;

// First and last local day of the window ($2 = time zone, $3 = days), and the same
// days as timestamps, so the time filters can use the (user_id, time) indexes.
const BOUNDS = `bounds as (
  select (now() at time zone $2)::date - ($3::int - 1) as first_day,
         (now() at time zone $2)::date as last_day,
         ((now() at time zone $2)::date - ($3::int - 1))::timestamp at time zone $2 as starts,
         ((now() at time zone $2)::date + 1)::timestamp at time zone $2 as ends
)`;

interface Session {
  date: string; // YYYY-MM-DD, local
  topWeight: number | null; // heaviest weight that day; null = bodyweight only
  reps: number; // most reps at that weight
}

export async function registerProgressRoutes(app: FastifyInstance) {
  app.get("/v1/progress", async (req, reply) => {
    const query = Query.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "days must be 7 or 30" });
    const days = Number(query.data.days);

    const userId = currentUserId(req);
    const user = await loadUser(userId);
    const timeZone = isValidTimeZone(query.data.timeZone) ? query.data.timeZone : user.timeZone;

    const nutrition = await db.query(
      `with ${BOUNDS},
       totals as (
         select (m.eaten_at at time zone $2)::date as day, count(distinct m.meal_id)::int as meals,
                sum(i.kcal) as kcal, sum(i.protein_g) as protein_g, sum(i.carbs_g) as carbs_g, sum(i.fat_g) as fat_g
         from bounds b, meals m join meal_items i using (meal_id)
         where m.user_id = $1 and m.status = 'saved' and m.eaten_at >= b.starts and m.eaten_at < b.ends
         group by 1
       )
       select d::date::text as date, coalesce(t.meals, 0) as meals, coalesce(t.kcal, 0) as kcal,
              coalesce(t.protein_g, 0) as protein_g, coalesce(t.carbs_g, 0) as carbs_g, coalesce(t.fat_g, 0) as fat_g
       from bounds b, generate_series(b.first_day::timestamp, b.last_day::timestamp, interval '1 day') as d
       left join totals t on t.day = d::date
       order by d`,
      [userId, timeZone, days],
    );

    // One row per exercise per day: the heaviest set (converted to the user's unit),
    // then the most reps at that weight. Bodyweight sets have no weight.
    const workouts = await db.query(
      `with ${BOUNDS},
       logs as (
         select w.exercise_id, (w.performed_at at time zone $2)::date as day, w.reps,
                case when w.weight is null or w.unit::text = $4 then w.weight
                     when w.unit = 'kg' then w.weight * $5
                     else w.weight / $5 end as weight
         from bounds b, workout_logs w
         where w.user_id = $1 and w.status = 'saved' and w.performed_at >= b.starts and w.performed_at < b.ends
       )
       select distinct on (l.exercise_id, l.day) l.exercise_id, e.name, e.category, l.day::text as date, l.weight, l.reps
       from logs l join exercises e using (exercise_id)
       order by l.exercise_id, l.day, l.weight desc nulls last, l.reps desc`,
      [userId, timeZone, days, user.units, LB_PER_KG],
    );

    const exercises = new Map<number, { exerciseId: number; name: string; category: string; sessions: Session[] }>();
    for (const r of workouts.rows) {
      let ex = exercises.get(r.exercise_id);
      if (!ex) {
        ex = { exerciseId: r.exercise_id, name: r.name, category: r.category, sessions: [] };
        exercises.set(r.exercise_id, ex);
      }
      ex.sessions.push({ date: r.date, topWeight: r.weight === null ? null : round1(Number(r.weight)), reps: r.reps });
    }
    // Most recently trained first, like GET /v1/exercises.
    const lastDate = (e: { sessions: Session[] }) => e.sessions[e.sessions.length - 1].date;
    const byRecent = [...exercises.values()].sort(
      (a, b) => lastDate(b).localeCompare(lastDate(a)) || a.name.localeCompare(b.name),
    );

    return {
      days,
      from: nutrition.rows[0].date,
      to: nutrition.rows[nutrition.rows.length - 1].date,
      timeZone,
      goals: user.goals,
      // Sum unrounded item values, then round once (matches GET /v1/today).
      nutrition: nutrition.rows.map((r) => ({
        date: r.date,
        meals: r.meals,
        kcal: Math.round(Number(r.kcal)),
        protein_g: round1(Number(r.protein_g)),
        carbs_g: round1(Number(r.carbs_g)),
        fat_g: round1(Number(r.fat_g)),
      })),
      unit: user.units,
      exercises: byRecent,
    };
  });
}
