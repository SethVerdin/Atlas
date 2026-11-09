// The signed-in user. src/auth.ts checks the bearer token on every /v1 request and
// sets req.userId; routes and tools scope every query by it.

import type { FastifyRequest } from "fastify";
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

export function currentUserId(req: FastifyRequest): number {
  // Only reachable without a user ID if a route skipped the auth hook by mistake.
  if (req.userId === undefined) throw new Error(`${req.routeOptions.url} ran without a signed-in user.`);
  return req.userId;
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
