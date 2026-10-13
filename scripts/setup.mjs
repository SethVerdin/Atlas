// One-time (and safe to re-run) local setup: `npm run setup`
// 1. Checks Node and Docker  2. Creates .env  3. Installs dependencies  4. Starts PostgreSQL
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function step(msg) {
  console.log(`\n==> ${msg}`);
}

function fail(msg) {
  console.error(`\nSetup failed: ${msg}`);
  process.exit(1);
}

// Commands are fixed strings (no user input), run through the shell so `npm` resolves
// to npm.cmd on Windows.
function run(command, cwd = root) {
  const result = spawnSync(command, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) fail(`\`${command}\` exited with code ${result.status} (in ${cwd})`);
}

function succeeds(command) {
  return spawnSync(command, { cwd: root, stdio: "ignore", shell: true }).status === 0;
}

step("Checking Node.js");
const major = Number(process.versions.node.split(".")[0]);
if (major < 24) fail(`Node.js 24 or newer is required (you have ${process.version}). Install the LTS from https://nodejs.org`);
console.log(`Node.js ${process.version}`);

step("Checking Docker");
if (!succeeds("docker --version")) fail("Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop/");
if (!succeeds("docker info")) fail('Docker is installed but not running. Open Docker Desktop, wait for "Engine running", then re-run `npm run setup`.');
console.log("Docker is running");

step("Creating .env");
const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  console.log(".env already exists, leaving it unchanged");
} else {
  copyFileSync(path.join(root, ".env.example"), envPath);
  console.log("Created .env from .env.example (edit it to set your own DB_PASSWORD and API keys)");
}

for (const dir of ["api", "app"]) {
  step(`Installing dependencies (${dir})`);
  run("npm ci", path.join(root, dir));
}

step("Starting PostgreSQL (first run also loads database/schema.sql)");
run("docker compose up -d --wait");

console.log(`
Setup complete.

  npm run dev       start the API (http://localhost:3000/health) and the Expo app
  npm run dev:api   start only the API
  npm run dev:app   start only the Expo app
`);
