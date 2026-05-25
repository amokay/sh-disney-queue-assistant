#!/usr/bin/env node
/**
 * 从高德 POI 写入 SQLite attractions：补全 gcj_lat/gcj_lng，并按 geo_reference.json 写 position_x/z。
 *
 * 前置：backend/.env 或仓库根 .env 中配置 AMAP_WEB_KEY；建议已存在 geo_reference.json。
 *
 * 用法（在 backend 目录）：
 *   npm run sync-amap -- text "创极速光轮"
 *   npm run sync-amap -- text "上海迪士尼" --max-total 200
 *   npm run sync-amap -- around
 *   npm run sync-amap -- file ../names.txt
 *   npm run sync-amap -- file names.txt --all-on-line
 *   npm run sync-amap -- seed
 *     按 backend/data/amap_seed_id_queries.json：用高德关键字第一条更新**已有 id**的 gcj_lat/lng 与 position_x/z。
 *
 * 配置文件（可选）：frontend/assets/data/amap_pois_sync.json
 * 示例见 amap_pois_sync.example.json。未创建时使用 geo 锚点为中心 + 默认半径/关键词。
 *
 * 仅打印不写库：加 --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "../loadEnv.js";
import { db } from "../db/connection.js";
import { ensureAttractionsAuxColumns } from "../db/seed.js";
import { amapPlaceAroundPage, amapPlaceTextPage, requireAmapWebKey } from "../services/amapPlaceClient.js";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "../services/geoProject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const backendRoot = path.join(__dirname, "..");
const geoPath = path.join(repoRoot, "frontend", "assets", "data", "geo_reference.json");
const userConfigPath = path.join(repoRoot, "frontend", "assets", "data", "amap_pois_sync.json");

const dryRun = process.argv.includes("--dry-run");

function argValue(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rowIdForPoi(amapId) {
  const safe = String(amapId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `ap_${safe}`;
}

/**
 * @param {import("better-sqlite3").Database} database
 * @param {NonNullable<ReturnType<typeof readGeoReferenceFromDisk>>} ref
 * @param {{ amapId: string, name: string, type: string, address: string, tel: string, lat: number, lng: number }} poi
 */
function upsertAttractionFromPoi(database, ref, poi, sourceTag) {
  const amapId = poi.amapId;
  const id = rowIdForPoi(amapId);
  const zone = (poi.type.split(";")[0] || "高德POI").trim().slice(0, 120);
  const desc = [poi.type, poi.address].filter(Boolean).join(" · ").slice(0, 2000);
  const { x, z } = latLngToSceneXZ(poi.lat, poi.lng, ref);

  const existing = database.prepare(`SELECT id, position_y FROM attractions WHERE amap_id = ?`).get(amapId);
  const targetId = existing?.id ?? id;
  const posY = Number(existing?.position_y ?? 0);

  if (existing) {
    database
      .prepare(
        `UPDATE attractions SET
          name = @name, zone = @zone, gcj_lat = @gcj_lat, gcj_lng = @gcj_lng,
          position_x = @position_x, position_y = @position_y, position_z = @position_z,
          description = @description, address = @address, poi_type = @poi_type, tel = @tel, source = @source
         WHERE amap_id = @amap_id`
      )
      .run({
        name: poi.name,
        zone,
        gcj_lat: poi.lat,
        gcj_lng: poi.lng,
        position_x: x,
        position_y: posY,
        position_z: z,
        description: desc,
        address: poi.address,
        poi_type: poi.type,
        tel: poi.tel || null,
        source: sourceTag,
        amap_id: amapId,
      });
    return { action: "update", id: targetId };
  }

  database
    .prepare(
      `INSERT INTO attractions (
        id, name, zone, position_x, position_y, position_z, description,
        gcj_lat, gcj_lng, amap_id, address, poi_type, tel, source
      ) VALUES (
        @id, @name, @zone, @position_x, @position_y, @position_z, @description,
        @gcj_lat, @gcj_lng, @amap_id, @address, @poi_type, @tel, @source
      )`
    )
    .run({
      id: targetId,
      name: poi.name,
      zone,
      position_x: x,
      position_y: posY,
      position_z: z,
      description: desc,
      gcj_lat: poi.lat,
      gcj_lng: poi.lng,
      amap_id: amapId,
      address: poi.address,
      poi_type: poi.type,
      tel: poi.tel || null,
      source: sourceTag,
    });
  return { action: "insert", id: targetId };
}

function loadJsonOptional(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function defaultAroundOptions(ref) {
  return {
    city: process.env.AMAP_CITY || "上海",
    location: `${ref.anchorLngGCJ},${ref.anchorLatGCJ}`,
    radius: 3500,
    keywords: "上海迪士尼度假区",
    types: "",
    maxTotal: 800,
    delayMs: 200,
    offset: 25,
  };
}

function mergeAroundConfig(ref, doc) {
  const base = defaultAroundOptions(ref);
  if (!doc || typeof doc !== "object") return base;
  const ar = /** @type {Record<string, unknown>} */ (doc).around;
  if (!ar || typeof ar !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (ar);
  return {
    ...base,
    city: typeof doc.city === "string" ? doc.city : base.city,
    location: typeof o.location === "string" ? o.location : base.location,
    radius: Number.isFinite(Number(o.radius)) ? Number(o.radius) : base.radius,
    keywords: o.keywords != null ? String(o.keywords) : base.keywords,
    types: o.types != null ? String(o.types) : base.types,
    maxTotal: Number.isFinite(Number(o.maxTotal)) ? Number(o.maxTotal) : base.maxTotal,
    delayMs: Number.isFinite(Number(o.delayMs)) ? Number(o.delayMs) : base.delayMs,
    offset: Number.isFinite(Number(o.offset)) ? Math.min(25, Math.max(1, Number(o.offset))) : base.offset,
  };
}

async function syncAround(database, ref, maxTotalOverride) {
  const raw = loadJsonOptional(userConfigPath);
  let cfg = mergeAroundConfig(ref, raw);
  if (maxTotalOverride != null) cfg = { ...cfg, maxTotal: maxTotalOverride };
  console.log("周边检索参数:", { ...cfg, location: cfg.location });

  const seen = new Set();
  let page = 1;
  let written = 0;
  const maxPages = 200;

  while (page <= maxPages && written < cfg.maxTotal) {
    const { ok, info, pois, total } = await amapPlaceAroundPage({
      location: cfg.location,
      radius: cfg.radius,
      keywords: cfg.keywords || undefined,
      types: cfg.types || undefined,
      city: cfg.city,
      page,
      offset: cfg.offset,
    });
    if (!ok) throw new Error(info || "周边检索失败");

    for (const poi of pois) {
      if (seen.has(poi.amapId)) continue;
      seen.add(poi.amapId);
      if (dryRun) {
        console.log(`[dry-run] ${poi.name} @ ${poi.lat},${poi.lng} (${poi.amapId})`);
      } else {
        const r = upsertAttractionFromPoi(database, ref, poi, "amap_around");
        console.log(`[${r.action}] ${r.id} ${poi.name}`);
      }
      written++;
      if (written >= cfg.maxTotal) break;
    }

    const fetchedUpTo = page * cfg.offset;
    const noMore =
      pois.length === 0 ||
      written >= cfg.maxTotal ||
      (total > 0 && fetchedUpTo >= total) ||
      (total === 0 && pois.length < cfg.offset);
    if (noMore) break;
    page += 1;
    await sleep(cfg.delayMs);
  }

  console.log(`周边模式结束：去重后约 ${seen.size} 条 POI，写入上限 ${cfg.maxTotal}。`);
}

async function syncTextAllPages(database, ref, keyword, maxTotal, delayMs, offset) {
  const city = process.env.AMAP_CITY || "上海";
  let page = 1;
  const seen = new Set();
  let written = 0;
  const maxPages = 200;

  while (page <= maxPages && written < maxTotal) {
    const { ok, info, pois, total } = await amapPlaceTextPage({
      keywords: keyword,
      city,
      page,
      offset,
    });
    if (!ok) throw new Error(info || "关键字检索失败");

    for (const poi of pois) {
      if (seen.has(poi.amapId)) continue;
      seen.add(poi.amapId);
      if (dryRun) {
        console.log(`[dry-run] ${poi.name} @ ${poi.lat},${poi.lng}`);
      } else {
        const r = upsertAttractionFromPoi(database, ref, poi, "amap_text");
        console.log(`[${r.action}] ${r.id} ${poi.name}`);
      }
      written++;
      if (written >= maxTotal) break;
    }

    const fetchedUpTo = page * offset;
    const noMore =
      pois.length === 0 ||
      written >= maxTotal ||
      (total > 0 && fetchedUpTo >= total) ||
      (total === 0 && pois.length < offset);
    if (noMore) break;
    page += 1;
    await sleep(delayMs);
  }
}

/** 相对路径优先相对 backend 目录解析（从项目根执行 npm run 时 cwd 常在根目录） */
function resolveKeywordFilePath(filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  const trimmed = filePath.replace(/^\.\/+/, "");
  const fromBackend = path.join(backendRoot, trimmed);
  if (fs.existsSync(fromBackend)) return fromBackend;
  const fromCwd = path.join(process.cwd(), filePath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return fromBackend;
}

async function syncFileLines(database, ref, filePath, firstOnly) {
  const abs = resolveKeywordFilePath(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `文件不存在: ${abs}\n（已尝试 backend 目录与当前工作目录 ${process.cwd()}，请检查路径）`
    );
  }
  console.log(`[sync-amap] 使用关键词文件: ${abs}`);
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const city = process.env.AMAP_CITY || "上海";
  const delayMs = Number(argValue("--delay-ms", "220")) || 220;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const kw = t;
    console.log(`[sync-amap] 检索中… ${kw}`);
    const { ok, info, pois } = await amapPlaceTextPage({ keywords: kw, city, page: 1, offset: 25 });
    if (!ok) {
      console.warn(`跳过（检索失败）: ${kw} → ${info}`);
      await sleep(delayMs);
      continue;
    }
    const list = firstOnly ? pois.slice(0, 1) : pois;
    if (!list.length) {
      console.warn(`无结果: ${kw}`);
      await sleep(delayMs);
      continue;
    }
    for (const poi of list) {
      if (dryRun) console.log(`[dry-run] ${kw} → ${poi.name}`);
      else {
        const r = upsertAttractionFromPoi(database, ref, poi, "amap_text_file");
        console.log(`[${r.action}] ${kw} → ${r.id} ${poi.name}`);
      }
    }
    await sleep(delayMs);
  }
  console.log("[sync-amap] 关键词文件处理完毕。");
}

/**
 * 按 id 更新 attractions 已有行：高德关键字第一条 → 真实 GCJ + 投影 x/z
 * @param {import("better-sqlite3").Database} database
 * @param {NonNullable<ReturnType<typeof readGeoReferenceFromDisk>>} ref
 * @param {string} jsonPath
 */
async function syncSeedBindings(database, ref, jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    console.error("找不到配置文件:", jsonPath);
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const bindings = Array.isArray(doc.bindings) ? doc.bindings : [];
  if (!bindings.length) {
    console.error("JSON 中 bindings 为空");
    process.exit(1);
  }

  const delayMs = Math.max(0, parseInt(argValue("--delay-ms", "220"), 10) || 220);
  const city = process.env.AMAP_CITY || "上海";

  const getRow = database.prepare(`SELECT id, position_y FROM attractions WHERE id = ?`);
  const upd = database.prepare(`
    UPDATE attractions SET
      gcj_lat = @gcj_lat, gcj_lng = @gcj_lng,
      position_x = @position_x, position_z = @position_z,
      amap_id = @amap_id, address = @address, poi_type = @poi_type, tel = @tel, source = @source
    WHERE id = @id
  `);

  for (const b of bindings) {
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const keywords = typeof b.keywords === "string" ? b.keywords.trim() : "";
    if (!id || !keywords) {
      console.warn("跳过无效项（缺少 id 或 keywords）:", b);
      continue;
    }
    const existing = getRow.get(id);
    if (!existing) {
      console.warn(`跳过：数据库中无 id=${id}`);
      continue;
    }

    console.log(`[sync-amap] seed 检索: ${id} ← ${keywords}`);
    const { ok, info, pois } = await amapPlaceTextPage({ keywords, city, page: 1, offset: 5 });
    if (!ok || !pois?.length) {
      console.warn(`  失败: ${info || "无结果"}`);
      await sleep(delayMs);
      continue;
    }
    const poi = pois[0];
    const { x, z } = latLngToSceneXZ(poi.lat, poi.lng, ref);

    if (dryRun) {
      console.log(`  [dry-run] ${poi.name} @ ${poi.lat},${poi.lng} → x=${x.toFixed(2)} z=${z.toFixed(2)}`);
    } else {
      upd.run({
        id,
        gcj_lat: poi.lat,
        gcj_lng: poi.lng,
        position_x: x,
        position_z: z,
        amap_id: poi.amapId,
        address: poi.address,
        poi_type: poi.type,
        tel: poi.tel || null,
        source: "amap_seed_id",
      });
      console.log(`  → 已更新 ${id}: ${poi.name} @ ${poi.lat}, ${poi.lng} → x=${x.toFixed(2)} z=${z.toFixed(2)}`);
    }
    await sleep(delayMs);
  }
  console.log("[sync-amap] seed 处理完毕。");
}

function printHelp() {
  console.log(`
npm run sync-amap -- <子命令> [参数…]

子命令：
  text <关键字>     关键字搜索，分页拉取（默认每关键词最多 500 条，可用 --max-total 改）
  around           以 geo_reference 锚点为中心做周边检索（参数见 amap_pois_sync.json）
  file <路径>      文本文件每行一个检索词；默认每行只取检索结果第一条。
                   加 --all-on-line 则采纳该关键词第一页全部 POI（最多 25 条）。
  seed [json路径]  按「数据库里已有 id」用高德第一条更新 gcj 与 x/z；默认读 backend/data/amap_seed_id_queries.json

实际 flag：
  --dry-run
  --max-total <n>   用于 text / around
  --delay-ms <n>    分页请求间隔（默认 200~220ms）
  --all-on-line     与 file 合用：每行关键词采纳第一页全部 POI（最多 offset 条）

示例：
  npm run sync-amap -- text "上海迪士尼度假区"
  npm run sync-amap -- around
  npm run sync-amap -- file ./data/poi_keywords.txt
  npm run sync-amap -- seed
`);
}

async function main() {
  console.log("[sync-amap] 启动…");
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const sub = argv[0];
  if (!sub || sub === "help" || sub === "-h") {
    printHelp();
    process.exit(sub ? 0 : 1);
  }

  ensureAttractionsAuxColumns(db);

  const ref = readGeoReferenceFromDisk(geoPath);
  if (!ref) {
    console.error("缺少或无法解析 geo_reference.json，无法写入 position_x/z。");
    process.exit(1);
  }

  if (["text", "around", "file", "seed"].includes(sub)) {
    try {
      requireAmapWebKey();
    } catch (e) {
      console.error(String(e?.message || e));
      console.error("请在 backend/.env 或仓库根目录 .env 中设置 AMAP_WEB_KEY=你的高德 Web 服务 Key，保存后再运行。");
      process.exit(1);
    }
  }

  const maxTotalCliRaw = argValue("--max-total", null);
  const maxTotalFromCli =
    maxTotalCliRaw != null ? Math.max(1, parseInt(maxTotalCliRaw, 10) || 0) || null : null;
  const maxTotalText = maxTotalFromCli ?? 500;
  const delayMs = Math.max(0, parseInt(argValue("--delay-ms", "200"), 10) || 200);
  const offset = Math.min(25, Math.max(1, parseInt(argValue("--offset", "25"), 10) || 25));

  if (sub === "around") {
    await syncAround(db, ref, maxTotalFromCli ?? undefined);
    return;
  }

  if (sub === "text") {
    const keyword = argv.slice(1).join(" ").trim();
    if (!keyword) {
      console.error("请提供关键字，例如：npm run sync-amap -- text 创极速光轮");
      process.exit(1);
    }
    await syncTextAllPages(db, ref, keyword, maxTotalText, delayMs, offset);
    return;
  }

  if (sub === "file") {
    const fp = argv[1];
    if (!fp) {
      console.error("请提供文件路径");
      process.exit(1);
    }
    const allOnLine = process.argv.includes("--all-on-line");
    const firstOnly = !allOnLine;
    await syncFileLines(db, ref, fp, firstOnly);
    return;
  }

  if (sub === "seed") {
    const custom = argv.slice(1).join(" ").trim();
    const jsonPath = custom
      ? resolveKeywordFilePath(custom)
      : path.join(backendRoot, "data", "amap_seed_id_queries.json");
    await syncSeedBindings(db, ref, jsonPath);
    return;
  }

  console.error("未知子命令:", sub);
  printHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
