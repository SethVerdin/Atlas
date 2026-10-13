import Fastify from "fastify";
import { Pool } from "pg";
import { config } from "./config";

const db = new Pool(config.db);
const app = Fastify({ logger: true });

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
