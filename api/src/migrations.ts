// Database migrations: numbered SQL files in database/migrations, applied in order.
//
// Each file runs once, in its own transaction, and is recorded in schema_migrations
// with a checksum of its contents. A schema change is always a new file: applied
// files must not change (the runner stops if one did). Nothing here drops data on
// its own, so applying a teammate's migration keeps your local data.
//
// The CLI is src/migrate.ts (npm run db:migrate, npm run db:new-migration).

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { db } from "./db";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../database/migrations");

const FILE_NAME = /^(\d{3})_([a-z0-9_]+)\.sql$/;

// Any fixed number works; every runner just has to use the same one.
const LOCK_KEY = 4_281_001;

export interface Migration {
  version: string; // file name without .sql, e.g. "001_initial_schema"
  file: string;
  sql: string;
  checksum: string;
}

/** A problem with the migration files or their history, shown as is. */
export class MigrationError extends Error {}

/** The migration files, in order. Throws on a misnamed file or a reused number. */
export function listMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const byNumber = new Map<string, string>();
  return files.map((file) => {
    const match = FILE_NAME.exec(file);
    if (!match) {
      throw new MigrationError(`${file}: name migrations like 002_add_something.sql (3 digits, lowercase, underscores).`);
    }
    const other = byNumber.get(match[1]);
    if (other) {
      throw new MigrationError(`${other} and ${file} share the number ${match[1]}. Renumber the one that isn't merged yet.`);
    }
    byNumber.set(match[1], file);
    // Normalize line endings so every checkout gets the same checksum.
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/\r\n/g, "\n");
    return { version: file.slice(0, -".sql".length), file, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  });
}

/** Files not applied to the database yet (all of them for an empty database). */
export async function pendingMigrations(): Promise<string[]> {
  const migrations = listMigrations();
  const { rows } = await db.query<{ exists: boolean }>("select to_regclass('public.schema_migrations') is not null as exists");
  if (!rows[0].exists) return migrations.map((m) => m.file);
  const applied = await db.query<{ version: string }>("select version from schema_migrations");
  const done = new Set(applied.rows.map((r) => r.version));
  return migrations.filter((m) => !done.has(m.version)).map((m) => m.file);
}

/**
 * Applies every pending migration in order and returns the files it applied.
 * A failed file is rolled back completely, and the files after it are not run.
 */
export async function migrate(log: (message: string) => void = console.log): Promise<string[]> {
  const migrations = listMigrations();
  const client = await db.connect();
  try {
    // One runner at a time, e.g. when `npm run setup` and `npm run dev` overlap.
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`
      create table if not exists schema_migrations (
        version    text        primary key,
        checksum   text        not null,
        applied_at timestamptz not null default now()
      )`);

    let applied = await appliedChecksums(client);
    if (!applied.size && (await adoptLegacySchema(client, migrations))) {
      log("This database was built by the old database/schema.sql, which matches 001_initial_schema.sql. Recorded 001 as applied.");
      applied = await appliedChecksums(client);
    }
    checkHistory(migrations, applied, log);

    const done: string[] = [];
    for (const m of migrations.filter((x) => !applied.has(x.version))) {
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [m.version, m.checksum]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        const reason = err instanceof Error ? err.message : String(err);
        throw new MigrationError(`${m.file} failed${lineOf(m.sql, err)}: ${reason}. Nothing from this file was applied.`);
      }
      log(`Applied ${m.file}`);
      done.push(m.file);
    }
    return done;
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/** Creates the next numbered migration file and returns its path. */
export function createMigration(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!slug) throw new MigrationError("Name the migration, e.g. npm run db:new-migration -- add_exercise_archive");
  const last = listMigrations().at(-1);
  const next = String((last ? Number(last.file.slice(0, 3)) : 0) + 1).padStart(3, "0");
  const file = path.join(MIGRATIONS_DIR, `${next}_${slug}.sql`);
  const header = [
    `-- ${next}: ${slug.replace(/_/g, " ")}`,
    "-- Runs once, in a transaction (so no BEGIN/COMMIT here). Never edit this file after",
    "-- it is merged: add a new migration instead. See docs/database.md, \"Migrations\".",
    "",
    "",
  ].join("\n");
  writeFileSync(file, header, { flag: "wx" }); // wx: never overwrite an existing file
  return file;
}

async function appliedChecksums(client: PoolClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ version: string; checksum: string }>("select version, checksum from schema_migrations");
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

// Applied files must be unchanged, or databases built before and after the edit
// would silently differ.
function checkHistory(migrations: Migration[], applied: Map<string, string>, log: (message: string) => void) {
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  for (const [version, checksum] of applied) {
    const m = byVersion.get(version);
    if (!m) {
      // Usually a migration from another branch; harmless until that branch is merged.
      log(`Note: ${version}.sql is applied to this database but isn't in this checkout (another branch?).`);
    } else if (m.checksum !== checksum) {
      throw new MigrationError(
        `${m.file} changed after it was applied to this database. Put the change in a new migration ` +
          "(npm run db:new-migration -- <name>) and undo the edit. If the file isn't merged yet, " +
          "`npm run db:reset` rebuilds the database with the edited file instead (deletes local data).",
      );
    }
  }
}

// Before migrations existed, database/schema.sql built the whole database when the
// Docker volume was created. A database built by its last version already matches
// 001_initial_schema, so 001 is recorded as applied instead of run. One built by an
// older version can't be upgraded and has to be reset.
const LEGACY_TABLES = ["users", "chat_messages", "usda_foods", "meals", "meal_items", "exercises", "workout_logs"];

async function adoptLegacySchema(client: PoolClient, migrations: Migration[]): Promise<boolean> {
  const initial = migrations.find((m) => m.version === "001_initial_schema");
  if (!initial) return false;
  const { rows } = await client.query<{ present: number }>(
    "select count(*)::int as present from unnest($1::text[]) as t where to_regclass('public.' || t) is not null",
    [LEGACY_TABLES],
  );
  if (rows[0].present === 0) return false; // empty database: 001 runs normally
  if (rows[0].present < LEGACY_TABLES.length) {
    throw new MigrationError(
      "This database was built by an older database/schema.sql and can't be upgraded. " +
        "Run `npm run db:reset` to rebuild it (deletes local data).",
    );
  }
  await client.query("insert into schema_migrations (version, checksum) values ($1, $2)", [initial.version, initial.checksum]);
  return true;
}

/** " at line N" from a Postgres error's character position, when it has one. */
function lineOf(sql: string, err: unknown): string {
  const position = Number((err as { position?: string }).position);
  return position > 0 ? ` at line ${sql.slice(0, position - 1).split("\n").length}` : "";
}
