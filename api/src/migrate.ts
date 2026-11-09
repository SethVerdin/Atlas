// CLI for the migration runner (src/migrations.ts):
//
//   npm run db:migrate                     apply pending migrations
//   npm run db:new-migration -- <name>     create the next numbered file in database/migrations

import path from "node:path";
import { config } from "./config";
import { db } from "./db";
import { createMigration, migrate, MigrationError, MIGRATIONS_DIR } from "./migrations";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "new") {
    const file = createMigration(args.join("_"));
    console.log(`Created ${path.relative(path.resolve(MIGRATIONS_DIR, "../.."), file)}`);
    return;
  }
  if (command) throw new MigrationError(`Unknown command "${command}". Use no command to migrate, or "new <name>".`);

  const applied = await migrate();
  console.log(applied.length ? `Database is up to date (applied ${applied.length}).` : "Database is up to date.");
}

main()
  .catch((err: unknown) => {
    process.exitCode = 1;
    const code = (err as { code?: string }).code;
    if (err instanceof MigrationError) console.error(`Migration error: ${err.message}`);
    else if (code === "ECONNREFUSED") {
      console.error(`Can't reach the database at ${config.db.host}:${config.db.port}. Start it with \`npm run db:up\`.`);
    } else console.error(err);
  })
  .finally(() => db.end());
