// `npm run dev`: starts the API and the Expo app together.
// Expo gets the terminal (so its QR code and keyboard shortcuts work); the API runs
// alongside it and its logs are interleaved. Ctrl+C or quitting Expo stops both.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const api = spawn("npm --prefix api run dev", { cwd: root, stdio: ["ignore", "inherit", "inherit"], shell: true });
const app = spawn("npm --prefix app run start", { cwd: root, stdio: "inherit", shell: true });

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [api, app]) {
    if (child.exitCode !== null) continue;
    // On Windows, kill the whole process tree (npm -> node); elsewhere SIGTERM is enough.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  // Killed processes can report odd codes on Windows (e.g. 4294967295); normalize to 0-255.
  process.exit(Number.isInteger(code) && code >= 0 && code <= 255 ? code : 1);
}

api.on("exit", (code) => {
  if (!stopping) console.error(`\n[dev] API exited (code ${code}). Stopping the app too.`);
  stopAll(code);
});
app.on("exit", (code) => stopAll(code));
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
