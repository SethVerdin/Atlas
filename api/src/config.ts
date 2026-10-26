import path from "node:path";
import dotenv from "dotenv";

// All config lives in the repo-root .env (shared with docker-compose.yml).
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  host: process.env.API_HOST ?? "0.0.0.0",
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5433),
    database: process.env.DB_NAME ?? "atlas",
    user: process.env.DB_USER ?? "postgres",
    password: required("DB_PASSWORD"),
  },
  // Optional: the API starts without a key, and /v1/chat returns 503 until one is set.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
  },
};
