import Fastify from "fastify";
import { Pool } from "pg";
import { registerChatRoutes } from "./chat";
import { config } from "./config";

const db = new Pool(config.db);
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

// Reports whether the API is up and can reach PostgreSQL.
app.get("/health", async (_req, reply) => {
  try {
    await db.query("select 1");
    return { ok: true, db: "up" };
  } catch (err) {
    app.log.error(err);
    return reply.code(503).send({ ok: false, db: "down" });
  }
});

app.addHook("onClose", async () => {
  await db.end();
});

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
