import { Pool } from "pg";
import { config } from "./config";

export const db = new Pool(config.db);

// Every table the API queries. database/schema.sql only runs when the database is
// first created, so a local database made from an older schema.sql lacks newer
// tables until it is reset (npm run db:reset). Add new tables here too.
const REQUIRED_TABLES = ["users", "chat_messages", "usda_foods", "meals", "meal_items", "exercises", "workout_logs"];

/** Required tables the connected database doesn't have. Empty when it is up to date. */
export async function missingTables(): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    "select name from unnest($1::text[]) as name where to_regclass('public.' || name) is null",
    [REQUIRED_TABLES],
  );
  return rows.map((r) => r.name);
}
