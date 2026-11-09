// The signed-in user's own account data.
//
//   GET  /v1/me                  -> { user }
//   POST /v1/me                  { displayName?, units?, timeZone?, goals? } -> { user }
//   POST /v1/me/password         { currentPassword, newPassword } -> { ok: true }
//   POST /v1/me/delete           { password } -> { ok: true }   (deletes everything)
//
// The user ID always comes from the session token (currentUserId), never the body.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./auth";
import { db } from "./db";
import { currentUserId, type Goals } from "./user";

export interface Account {
  userId: number;
  email: string;
  displayName: string | null;
  units: "lb" | "kg";
  timeZone: string;
  goals: Goals;
  createdAt: string;
}

export async function loadAccount(userId: number): Promise<Account> {
  const { rows } = await db.query(
    `select email, display_name, weight_unit, time_zone, created_at,
            goal_kcal, goal_protein_g, goal_carbs_g, goal_fat_g
     from users where user_id = $1`,
    [userId],
  );
  const u = rows[0];
  return {
    userId,
    email: u.email,
    displayName: u.display_name,
    units: u.weight_unit,
    timeZone: u.time_zone,
    goals: { kcal: u.goal_kcal, protein_g: u.goal_protein_g, carbs_g: u.goal_carbs_g, fat_g: u.goal_fat_g },
    createdAt: u.created_at.toISOString(),
  };
}

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// null clears a goal; a missing key leaves it unchanged.
const goal = (max: number) => z.number().int().min(0).max(max).nullable().optional();

const UpdateBody = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  units: z.enum(["lb", "kg"]).optional(),
  timeZone: z.string().refine(isTimeZone, "Unknown time zone.").optional(),
  goals: z
    .object({
      kcal: z.number().int().min(1).max(20000).nullable().optional(),
      protein_g: goal(1000),
      carbs_g: goal(2000),
      fat_g: goal(1000),
    })
    .optional(),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "Use at least 8 characters for your new password.").max(200),
});

const DeleteBody = z.object({ password: z.string().min(1).max(200) });

async function checkPassword(userId: number, password: string): Promise<boolean> {
  const { rows } = await db.query<{ password_hash: string }>("select password_hash from users where user_id = $1", [userId]);
  return rows.length > 0 && verifyPassword(password, rows[0].password_hash);
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.get("/v1/me", async () => ({ user: await loadAccount(await currentUserId()) }));

  app.post("/v1/me", async (req, reply) => {
    const parsed = UpdateBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
    const { displayName, units, timeZone, goals } = parsed.data;

    // Build "column = $n" only for the fields that were sent.
    const columns: [string, unknown][] = [];
    if (displayName !== undefined) columns.push(["display_name", displayName || null]);
    if (units !== undefined) columns.push(["weight_unit", units]);
    if (timeZone !== undefined) columns.push(["time_zone", timeZone]);
    if (goals?.kcal !== undefined) columns.push(["goal_kcal", goals.kcal]);
    if (goals?.protein_g !== undefined) columns.push(["goal_protein_g", goals.protein_g]);
    if (goals?.carbs_g !== undefined) columns.push(["goal_carbs_g", goals.carbs_g]);
    if (goals?.fat_g !== undefined) columns.push(["goal_fat_g", goals.fat_g]);

    const userId = await currentUserId();
    if (columns.length) {
      const set = columns.map(([col], i) => `${col} = $${i + 2}`).join(", ");
      await db.query(`update users set ${set} where user_id = $1`, [userId, ...columns.map(([, v]) => v)]);
    }
    return { user: await loadAccount(userId) };
  });

  app.post("/v1/me/password", async (req, reply) => {
    const parsed = PasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });

    const userId = await currentUserId();
    if (!(await checkPassword(userId, parsed.data.currentPassword))) {
      return reply.code(403).send({ error: "Your current password is wrong." });
    }
    await db.query("update users set password_hash = $2 where user_id = $1", [userId, await hashPassword(parsed.data.newPassword)]);
    // Sign out every other device; this one stays signed in.
    await db.query("delete from sessions where user_id = $1 and session_id <> $2", [userId, req.auth!.sessionId]);
    return { ok: true };
  });

  app.post("/v1/me/delete", async (req, reply) => {
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter your password to delete your account." });

    const userId = await currentUserId();
    if (!(await checkPassword(userId, parsed.data.password))) {
      return reply.code(403).send({ error: "Wrong password." });
    }
    // Cascades remove sessions, chat, meals, workout logs, and custom exercises.
    // workout_logs -> exercises has no cascade, so drop the logs first.
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query("delete from workout_logs where user_id = $1", [userId]);
      await client.query("delete from users where user_id = $1", [userId]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  });
}
