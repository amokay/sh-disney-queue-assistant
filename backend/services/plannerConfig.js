import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cached = null;

export function getPlannerStep2Config() {
  if (cached) return cached;
  const p = path.join(__dirname, "..", "config", "planner_step2.json");
  cached = JSON.parse(fs.readFileSync(p, "utf8"));
  return cached;
}
