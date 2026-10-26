// There is no sign-in yet: every request acts as the demo user seeded by
// database/schema.sql. When auth lands, replace currentUserId with the user ID
// from the bearer token (it will take the request). Routes and tools already
// scope every query by it.

import { db } from "./db";

const DEMO_EMAIL = "demo@atlas.local";

export interface Goals {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface UserSettings {
  userId: number;
  units: "lb" | "kg";
  timeZone: string; // saved zone; the app's current zone is preferred when sent
  goals: Goals;
}

export async function currentUserId(): Promise<number> {
  const { rows } = await db.query<{ user_id: number }>("select user_id from users where email = $1", [DEMO_EMAIL]);
  if (!rows.length) throw new Error(`Demo user ${DEMO_EMAIL} is missing. Reset the database to reload schema.sql.`);
  return rows[0].user_id;
}

export async function loadUser(userId: number): Promise<UserSettings> {
  const { rows } = await db.query(
    `select weight_unit, time_zone, goal_kcal, goal_protein_g, goal_carbs_g, goal_fat_g
     from users where user_id = $1`,
    [userId],
  );
  const u = rows[0];
  return {
    userId,
    units: u.weight_unit,
    timeZone: u.time_zone,
    goals: { kcal: u.goal_kcal, protein_g: u.goal_protein_g, carbs_g: u.goal_carbs_g, fat_g: u.goal_fat_g },
  };
}
