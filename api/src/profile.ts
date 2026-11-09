// The signed-in user's account and the first sign-in questions.
//
//   GET  /v1/me        username, profile (null until answered), units, daily goals
//   POST /v1/profile   { sex, age, heightCm, weightKg, goal, units } → same as GET /v1/me
//
// Saving the profile recalculates the daily goals (src/macros.ts), replacing any
// earlier ones. The app always sends metric; `units` is only how weights are shown.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { dailyGoals } from "./macros";
import { currentUserId } from "./user";

const ProfileBody = z.object({
  sex: z.enum(["male", "female", "other"]),
  age: z.number().int().min(13, "Atlas is for ages 13 and up.").max(120),
  heightCm: z.number().min(100, "Check your height.").max(250, "Check your height."),
  weightKg: z.number().min(30, "Check your weight.").max(300, "Check your weight."),
  goal: z.enum(["lose", "maintain", "gain"]),
  units: z.enum(["lb", "kg"]),
});

/** What the app knows about the signed-in user. */
export async function loadMe(userId: number) {
  const { rows } = await db.query(
    `select username, weight_unit, sex, age, height_cm, weight_kg, body_goal, profile_completed_at,
            goal_kcal, goal_protein_g, goal_carbs_g, goal_fat_g
     from users where user_id = $1`,
    [userId],
  );
  const u = rows[0];
  return {
    username: u.username as string,
    units: u.weight_unit as "lb" | "kg",
    profile: u.profile_completed_at
      ? {
          sex: u.sex,
          age: u.age,
          heightCm: Number(u.height_cm),
          weightKg: Number(u.weight_kg),
          goal: u.body_goal,
        }
      : null,
    goals: { kcal: u.goal_kcal, protein_g: u.goal_protein_g, carbs_g: u.goal_carbs_g, fat_g: u.goal_fat_g },
  };
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/v1/me", async (req) => loadMe(currentUserId(req)));

  app.post("/v1/profile", async (req, reply) => {
    const parsed = ProfileBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const p = {
      ...parsed.data,
      heightCm: Math.round(parsed.data.heightCm * 10) / 10,
      weightKg: Math.round(parsed.data.weightKg * 100) / 100, // matches NUMERIC(5, 2)
    };
    const goals = dailyGoals(p);
    const userId = currentUserId(req);
    await db.query(
      `update users set sex = $2, age = $3, height_cm = $4, weight_kg = $5, body_goal = $6, weight_unit = $7,
              goal_kcal = $8, goal_protein_g = $9, goal_carbs_g = $10, goal_fat_g = $11,
              profile_completed_at = coalesce(profile_completed_at, now())
       where user_id = $1`,
      [
        userId,
        p.sex,
        p.age,
        p.heightCm,
        p.weightKg,
        p.goal,
        p.units,
        goals.kcal,
        goals.protein_g,
        goals.carbs_g,
        goals.fat_g,
      ],
    );
    return loadMe(userId);
  });
}
