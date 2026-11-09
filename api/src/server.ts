import Fastify from "fastify";
import { registerChatRoutes } from "./chat";
import { config } from "./config";
import { db } from "./db";
import { MigrationError, pendingMigrations } from "./migrations";
import { registerProgressRoutes } from "./progress";
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
app.register(registerProgressRoutes);

const OUTDATED_HINT = "Run `npm run db:migrate` to apply them (keeps your data).";

// Reports whether the API is up, can reach PostgreSQL, and has every migration applied.
app.get("/health", async (_req, reply) => {
  let pending: string[];
  try {
    pending = await pendingMigrations();
  } catch (err) {
    app.log.error(err);
    if (err instanceof MigrationError) return reply.code(500).send({ ok: false, db: "error", error: err.message });
    return reply.code(503).send({ ok: false, db: "down" });
  }
  if (pending.length) return reply.code(503).send({ ok: false, db: "outdated", pending, fix: OUTDATED_HINT });
  return { ok: true, db: "up" };
});

app.addHook("onClose", async () => {
  await db.end();
});

// Unapplied migrations make routes fail with HTTP 500, so say why at startup.
// (`npm run dev` applies them before starting; `npm run dev:api` doesn't.)
async function warnIfSchemaOutdated() {
  const pending = await pendingMigrations().catch((err) => {
    if (err instanceof MigrationError) app.log.error(err.message);
    return []; // database down: /health reports that
  });
  if (pending.length) app.log.warn(`Database is missing migrations: ${pending.join(", ")}. ${OUTDATED_HINT}`);
}

app.listen({ port: config.port, host: config.host }).then(warnIfSchemaOutdated, (err) => {
  app.log.error(err);
  process.exit(1);
});
