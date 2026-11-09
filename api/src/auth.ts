// Accounts and sessions.
//
//   POST /v1/auth/register   { username, password } → { token, user }
//   POST /v1/auth/login      { username, password } → { token, user }
//   POST /v1/auth/logout     ends this device's session
//
// Every other /v1 route needs `Authorization: Bearer <token>`. The hook below looks
// the token up and sets req.userId; routes read it with currentUserId(req) and scope
// every query by it, so one user can never read or change another user's rows.
// The user ID always comes from the session, never from the request body or URL.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { loadMe } from "./profile";

declare module "fastify" {
  interface FastifyRequest {
    userId?: number;
  }
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: object,
) => Promise<Buffer>;

const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

// ---- Passwords ----

/** "scrypt$N$r$p$salt$hash" (base64), so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !hash) return false; // e.g. the demo user, which has no password
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// Checked against when the username doesn't exist, so a wrong username takes as long
// as a wrong password and response times don't reveal which usernames exist.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

// ---- Sessions ----

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [userId, sha256(token), SESSION_DAYS],
  );
  return token;
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() || null : null;
}

// ---- Failed sign-in limit ----

// After 10 wrong passwords for a username within 15 minutes, sign-in for it pauses
// until the window ends. In memory: resets when the API restarts.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function isLockedOut(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.since > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const f = failures.get(key);
  if (f && Date.now() - f.since <= FAILURE_WINDOW_MS) f.count++;
  else failures.set(key, { count: 1, since: Date.now() });
}

// ---- Routes ----

const Credentials = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.]{3,30}$/, "Usernames are 3–30 letters, numbers, dots, or underscores."),
  password: z
    .string()
    .min(8, "Passwords need at least 8 characters.")
    .max(128, "Passwords can be at most 128 characters."),
});

// Routes that work without a session.
const PUBLIC_ROUTES = new Set(["/v1/auth/register", "/v1/auth/login"]);

const unauthorized = (reply: FastifyReply) => reply.code(401).send({ error: "Please sign in again." });

// Called on the root instance (not app.register), so the hook covers every route.
export function registerAuth(app: FastifyInstance) {
  // Runs before every /v1 route (except sign-in and sign-up) and rejects the request
  // without a valid, unexpired session.
  app.addHook("preHandler", async (req, reply) => {
    const route = req.routeOptions.url;
    if (!route?.startsWith("/v1/") || PUBLIC_ROUTES.has(route)) return;
    const token = bearerToken(req);
    if (!token) return unauthorized(reply);
    const { rows } = await db.query<{ user_id: number }>(
      "select user_id from sessions where token_hash = $1 and expires_at > now()",
      [sha256(token)],
    );
    if (!rows.length) return unauthorized(reply);
    req.userId = rows[0].user_id;
  });

  app.post("/v1/auth/register", async (req, reply) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const { username, password } = parsed.data;

    let userId: number;
    try {
      const { rows } = await db.query<{ user_id: number }>(
        "insert into users (username, password_hash) values ($1, $2) returning user_id",
        [username, await hashPassword(password)],
      );
      userId = rows[0].user_id;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "That username is taken." });
      }
      throw err;
    }
    return { token: await createSession(userId), user: await loadMe(userId) };
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const parsed = z
      .object({ username: z.string().trim().min(1).max(30), password: z.string().min(1).max(128) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter your username and password." });
    const { username, password } = parsed.data;

    const key = username.toLowerCase();
    if (isLockedOut(key)) {
      return reply.code(429).send({ error: "Too many tries. Wait 15 minutes and try again." });
    }

    const { rows } = await db.query<{ user_id: number; password_hash: string }>(
      "select user_id, password_hash from users where lower(username) = $1",
      [key],
    );
    const ok = rows.length
      ? await verifyPassword(password, rows[0].password_hash)
      : await verifyPassword(password, await DUMMY_HASH).then(() => false);
    if (!ok) {
      recordFailure(key);
      // Same message either way, so it doesn't reveal which usernames exist.
      return reply.code(401).send({ error: "Wrong username or password." });
    }
    failures.delete(key);
    return { token: await createSession(rows[0].user_id), user: await loadMe(rows[0].user_id) };
  });

  app.post("/v1/auth/logout", async (req) => {
    await db.query("delete from sessions where token_hash = $1", [sha256(bearerToken(req)!)]);
    return { ok: true };
  });
}
