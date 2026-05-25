import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * 从 backend/.env 或仓库根目录 .env 加载 KEY=value（不覆盖已有环境变量）。
 * .gitignore 已忽略 .env，适合放 AMAP_WEB_KEY。
 */
export function loadEnvFromFiles() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")];
  for (const fp of candidates) {
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

loadEnvFromFiles();
