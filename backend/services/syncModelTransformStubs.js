import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listOptimizedGlbUrls } from "../routes/discover.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const transformsPath = path.join(__dirname, "..", "..", "frontend", "assets", "data", "model_transforms.json");

const OPT_PREFIX = "/assets/models/optimized/";

/**
 * 与前端 modelTransforms.findFirstMatchingRule 一致：URL 与 match 均转小写，match 为子串。
 * @param {string} url
 * @param {Array<{ match?: string }>} rules
 */
function urlMatchedByAnyRule(url, rules) {
  const lower = String(url).toLowerCase();
  return (rules || []).some((r) => {
    const m = String(r.match || "").toLowerCase();
    return m && lower.includes(m);
  });
}

/**
 * 用相对 optimized 的路径（不含 .glb）作为默认 match，避免不同子目录下同文件名冲突。
 * @param {string} url
 */
export function glbUrlToDefaultMatch(url) {
  const u = String(url).replace(/\\/g, "/");
  const i = u.toLowerCase().indexOf(OPT_PREFIX.toLowerCase());
  const rel = i >= 0 ? u.slice(i + OPT_PREFIX.length) : path.basename(u);
  return rel.replace(/\.glb$/i, "");
}

/**
 * 为尚未被任何 rule.match 覆盖的 .glb 在 model_transforms.json 末尾追加占位规则。
 * @param {{ silent?: boolean, dryRun?: boolean }} [options]
 * @returns {{ added: number, totalRules: number }}
 */
export function syncModelTransformStubs(options = {}) {
  const { silent = false, dryRun = false } = options;
  const urls = listOptimizedGlbUrls();

  let data = { rules: [] };
  if (fs.existsSync(transformsPath)) {
    const raw = fs.readFileSync(transformsPath, "utf8");
    try {
      data = JSON.parse(raw);
    } catch (e) {
      if (!silent) console.error("[syncModelTransformStubs] 无法解析 model_transforms.json:", e.message);
      throw e;
    }
  }

  const rules = Array.isArray(data.rules) ? [...data.rules] : [];
  let added = 0;

  for (const url of urls) {
    if (urlMatchedByAnyRule(url, rules)) continue;
    const match = glbUrlToDefaultMatch(url);
    rules.push({
      match,
      position: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      scale: 1,
    });
    added++;
  }

  if (added === 0) {
    if (!silent) console.log("[syncModelTransformStubs] 无需追加新规则（每个 .glb 已有匹配项）。");
    return { added: 0, totalRules: rules.length };
  }

  const out = { ...data, rules };

  if (dryRun) {
    if (!silent) console.log(`[syncModelTransformStubs] dryRun：将追加 ${added} 条，不写文件。`);
    return { added, totalRules: rules.length };
  }

  fs.writeFileSync(transformsPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  if (!silent) console.log(`[syncModelTransformStubs] 已向 model_transforms.json 追加 ${added} 条占位规则。`);
  return { added, totalRules: rules.length };
}
