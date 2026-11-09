// The signed-in user. api/src/auth.ts checks the bearer token on every request and
// stores the user ID for the request; currentUserId() reads it back. Routes and
// agent tools scope every query by it, so users only ever see their own data.

import { authContext } from "./auth";
import { db } from "./db";

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

/** The signed-in user's ID. Only call it while handling a request that needed a token. */
export async function currentUserId(): Promise<number> {
  const auth = authContext.getStore();
  if (!auth) throw new Error("currentUserId() was called outside a signed-in request.");
  return auth.userId;
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
