#!/usr/bin/env node
/**
 * CLI：按 glb_poi_bindings.json 同步 POI → model_transforms.json，并写 SQLite attractions（蓝球 xz / gcj 与模型同一 POI）。
 * 后端启动时也会自动执行（除非 SKIP_SYNC_GLB_POI=1）。
 *
 * 用法：cd backend && npm run sync-glb-poi
 * 仅预览：npm run sync-glb-poi -- --dry-run
 */
import "../loadEnv.js";
import { syncGlbPoiBindings } from "../services/syncGlbPoiBindings.js";

const dryRun = process.argv.includes("--dry-run");

syncGlbPoiBindings({ dryRun })
  .then(({ updated, skipped, errors, dbUpdated }) => {
    if (dryRun) console.log("\n[--dry-run] 未写入 model_transforms.json / 未写数据库");
    else if (dbUpdated > 0) console.log(`\n已同步 attractions 表 ${dbUpdated} 条（与 glb 位置一致）。`);
    if (errors.length) {
      console.error("\n部分失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
      process.exit(1);
    }
    if (updated === 0 && skipped === 0) {
      console.log("glb_poi_bindings.json 无有效条目，或未配置 bindings。");
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
