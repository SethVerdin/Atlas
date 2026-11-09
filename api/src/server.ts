import Fastify from "fastify";
import { registerChatRoutes } from "./chat";
import { config } from "./config";
import { db, missingTables } from "./db";
import { registerSummaryRoutes } from "./summary";

const app = Fastify({ logger: true });

// Lets the Expo web build (served from another port) call the API during development.
// Native apps don't need this. Tighten the allowed origin before deploying.
app.addHook("onRequest", async (req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return reply.code(204).send();
});

app.register(registerChatRoutes);
app.register(registerSummaryRoutes);

const OUTDATED_HINT = "Run `npm run db:reset` to rebuild it from database/schema.sql (deletes local data).";

// Reports whether the API is up, can reach PostgreSQL, and has every table it needs.
app.get("/health", async (_req, reply) => {
  let missing: string[];
  try {
    missing = await missingTables();
  } catch (err) {
    app.log.error(err);
    return reply.code(503).send({ ok: false, db: "down" });
  }
  if (missing.length) return reply.code(503).send({ ok: false, db: "outdated", missing, fix: OUTDATED_HINT });
  return { ok: true, db: "up" };
});

app.addHook("onClose", async () => {
  await db.end();
});

// An out-of-date local database makes routes fail with HTTP 500, so say why at startup.
async function warnIfSchemaOutdated() {
  const missing = await missingTables().catch(() => []); // database down: /health reports that
  if (missing.length) {
    app.log.warn(`Local database is out of date (missing tables: ${missing.join(", ")}). ${OUTDATED_HINT}`);
  }
}

app.listen({ port: config.port, host: config.host }).then(warnIfSchemaOutdated, (err) => {
  app.log.error(err);
  process.exit(1);
});
