import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** optimized 根目录：从 backend/routes 上两级到项目根，再进 frontend */
const optimizedRoot = path.join(__dirname, "..", "..", "frontend", "assets", "models", "optimized");

function walkGlb(dir, baseDir, acc) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkGlb(full, baseDir, acc);
    else if (name.toLowerCase().endsWith(".glb")) {
      const rel = path.relative(baseDir, full).split(path.sep).join("/");
      acc.push(`/assets/models/optimized/${rel}`);
    }
  }
}

/**
 * 列出 frontend/assets/models/optimized 下所有 .glb 的浏览器 URL
 * @returns {string[]}
 */
export function listOptimizedGlbUrls() {
  const acc = [];
  walkGlb(optimizedRoot, optimizedRoot, acc);
  acc.sort();
  return acc;
}
