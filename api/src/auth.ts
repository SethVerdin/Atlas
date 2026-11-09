// Sign-in for Atlas: accounts, password hashing, and bearer-token sessions.
//
//   POST /v1/auth/register  { email, password, displayName? }  -> { token, user }
//   POST /v1/auth/login     { email, password }                -> { token, user }
//   POST /v1/auth/logout                                       -> { ok: true }
//
// Every other /v1 route needs `Authorization: Bearer <token>`. The onRequest hook
// below looks the token up and puts the user ID where currentUserId() (user.ts)
// finds it, so the existing routes and agent tools keep working unchanged and every
// query stays scoped to the signed-in user (docs/database-known-issues.md, issue 2).
//
// Passwords use scrypt from node:crypto (no extra dependency). Tokens are 32 random
// bytes; only their SHA-256 is stored (database/migrations/002_auth_sessions.sql).

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "./db";
import { loadAccount } from "./account";

const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

/** Routes that work without signing in. Everything else under the API needs a token. */
const PUBLIC_ROUTES = new Set(["/health", "/v1/auth/register", "/v1/auth/login"]);

// ---- Request context: which user this request belongs to ----

interface AuthContext {
  userId: number;
  sessionId: number;
}

export const authContext = new AsyncLocalStorage<AuthContext>();

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

// ---- Passwords ----

function scrypt(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keyLen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$salt$hash", so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLen } = SCRYPT;
  const key = await scrypt(password, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false; // e.g. an account with no password
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A real hash to check against when the email doesn't exist, so a wrong email takes
// as long as a wrong password and response time doesn't reveal which accounts exist.
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

// ---- Sessions ----

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3))`,
    [userId, sha256(token), SESSION_DAYS],
  );
  return token;
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function findSession(token: string): Promise<AuthContext | null> {
  // Also slides the expiry forward, so an app that's used regularly stays signed in.
  const { rows } = await db.query<{ session_id: number; user_id: number }>(
    `update sessions
     set last_used_at = now(), expires_at = now() + make_interval(days => $2)
     where token_hash = $1 and expires_at > now()
     returning session_id, user_id`,
    [sha256(token), SESSION_DAYS],
  );
  return rows.length ? { userId: rows[0].user_id, sessionId: rows[0].session_id } : null;
}

// ---- Validation ----

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

const RegisterBody = z.object({
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(200, "That password is too long."),
  displayName: z.string().trim().max(80).optional(),
});

const LoginBody = z.object({ email, password: z.string().min(1).max(200) });

function badRequest(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: err.issues[0]?.message ?? "Invalid request." });
}

// ---- Routes ----

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest("auth", null);

  // Callback style on purpose: done() runs inside authContext.run(), so the route
  // handler (and everything it awaits) can read the user with currentUserId().
  app.addHook("onRequest", (req, reply, done) => {
    if (req.method === "OPTIONS") return done();
    const route = req.routeOptions.url;
    const isPublic = route === undefined || PUBLIC_ROUTES.has(route); // undefined = 404, let it through

    const token = bearerToken(req);
    const lookup = token ? findSession(token) : Promise.resolve(null);
    lookup.then(
      (auth) => {
        if (!auth && !isPublic) {
          reply.code(401).send({ error: "Please sign in again.", code: "unauthorized" });
          return;
        }
        req.auth = auth;
        if (auth) authContext.run(auth, done);
        else done();
      },
      (err: Error) => done(err),
    );
  });

  app.post("/v1/auth/register", async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error);
    const { email, password, displayName } = parsed.data;

    const passwordHash = await hashPassword(password);
    const { rows } = await db.query<{ user_id: number }>(
      `insert into users (email, password_hash, display_name)
       values ($1, $2, $3)
       on conflict do nothing
       returning user_id`,
      [email, passwordHash, displayName || null],
    );
    if (!rows.length) return reply.code(409).send({ error: "An account with that email already exists. Sign in instead." });

    const userId = rows[0].user_id;
    const token = await createSession(userId);
    return reply.code(201).send({ token, user: await loadAccount(userId) });
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter your email and password." });
    const { email, password } = parsed.data;

    const { rows } = await db.query<{ user_id: number; password_hash: string }>(
      "select user_id, password_hash from users where lower(email) = $1",
      [email],
    );
    const ok = rows.length
      ? await verifyPassword(password, rows[0].password_hash)
      : (await verifyPassword(password, await dummyHash), false);
    if (!ok) return reply.code(401).send({ error: "Wrong email or password." });

    const userId = rows[0].user_id;
    const token = await createSession(userId);
    return { token, user: await loadAccount(userId) };
  });

  app.post("/v1/auth/logout", async (req) => {
    if (req.auth) await db.query("delete from sessions where session_id = $1", [req.auth.sessionId]);
    return { ok: true };
  });
}
