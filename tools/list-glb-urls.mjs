#!/usr/bin/env node
/**
 * 不启动后端时，可运行本脚本生成 glb 列表，供前端读取 frontend/assets/data/glb_urls.json
 * 用法：node tools/list-glb-urls.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const optimized = path.join(root, "frontend", "assets", "models", "optimized");
const outFile = path.join(root, "frontend", "assets", "data", "glb_urls.json");

const acc = [];
function walk(dir, base) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, base);
    else if (name.toLowerCase().endsWith(".glb")) {
      const rel = path.relative(base, full).split(path.sep).join("/");
      acc.push(`/assets/models/optimized/${rel}`);
    }
  }
}
walk(optimized, optimized);
acc.sort();
fs.writeFileSync(outFile, JSON.stringify({ urls: acc }, null, 2), "utf8");
console.log(`已写入 ${outFile}，共 ${acc.length} 个 glb`);
