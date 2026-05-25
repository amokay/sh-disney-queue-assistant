import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "./geoProject.js";
import { normalizePlacePoi } from "./amapPlaceClient.js";
import { listOptimizedGlbUrls } from "../routes/discover.js";
import { db } from "../db/connection.js";
import { ensureAttractionsAuxColumns } from "../db/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

export function glbPoiBindingsPaths() {
  return {
    bindingsPath: path.join(repoRoot, "frontend", "assets", "data", "glb_poi_bindings.json"),
    transformsPath: path.join(repoRoot, "frontend", "assets", "data", "model_transforms.json"),
    geoPath: path.join(repoRoot, "frontend", "assets", "data", "geo_reference.json"),
    manifestPath: path.join(repoRoot, "frontend", "assets", "data", "models.manifest.json"),
  };
}

async function amapPlaceFirstRaw(keyword, city) {
  const key = process.env.AMAP_WEB_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("缺少 AMAP_WEB_KEY");
  const u = new URL("https://restapi.amap.com/v3/place/text");
  u.searchParams.set("keywords", keyword);
  u.searchParams.set("city", city);
  u.searchParams.set("output", "json");
  u.searchParams.set("offset", "1");
  u.searchParams.set("page", "1");
  u.searchParams.set("key", key);
  const res = await fetch(u);
  const j = await res.json();
  if (String(j.status) !== "1") {
    throw new Error(j.info || j.infocode || JSON.stringify(j));
  }
  const p0 = j.pois?.[0];
  const poi = normalizePlacePoi(p0);
  if (!poi) throw new Error(`无结果或坐标无效: ${keyword}`);
  return poi;
}

/**
 * 与前端 modelTransforms 一致：URL 子串命中多条 pickRule 时取 match 最长的 pickableAttractionId。
 * @param {string} url
 * @param {Array<{ match?: string, pickableAttractionId?: string }>} pickRules
 * @returns {string | null}
 */
export function pickAttractionIdForGlbUrl(url, pickRules) {
  const lower = String(url).toLowerCase();
  let bestId = null;
  let bestLen = -1;
  for (const pr of pickRules || []) {
    const id = typeof pr.pickableAttractionId === "string" ? pr.pickableAttractionId.trim() : "";
    const m = String(pr.match || "").toLowerCase();
    if (!id || !m || !lower.includes(m)) continue;
    if (m.length > bestLen) {
      bestLen = m.length;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * 根据 matchGlb 在 optimized 列表里找到相关 glb URL，再用 pickRules 解析景点 id。
 * @param {string} matchGlb
 * @param {string[]} glbUrls
 * @param {Array<{ match?: string, pickableAttractionId?: string }>} pickRules
 * @param {string | undefined} explicitAttractionId binding.attractionId
 */
export function resolveAttractionIdForBinding(matchGlb, glbUrls, pickRules, explicitAttractionId) {
  const ex = typeof explicitAttractionId === "string" ? explicitAttractionId.trim() : "";
  if (ex) return ex;

  const sub = String(matchGlb).toLowerCase();
  const relatedUrls = glbUrls.filter((u) => u.toLowerCase().includes(sub));
  if (!relatedUrls.length) return null;

  const ids = new Set();
  for (const url of relatedUrls) {
    const id = pickAttractionIdForGlbUrl(url, pickRules);
    if (id) ids.add(id);
  }
  if (ids.size === 1) return [...ids][0];
  if (ids.size > 1) return null;
  return null;
}

function loadPickRules(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const doc = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Array.isArray(doc.pickRules) ? doc.pickRules : [];
  } catch {
    return [];
  }
}

/**
 * 按 glb_poi_bindings.json 从高德拉 POI → 同一次投影写 model_transforms.json 的 position x/z，
 * 并写 SQLite attractions 的 gcj_lat/gcj_lng 与 position_x/z（与蓝球一致）。
 *
 * 景点 id 解析顺序：binding.attractionId（显式）→ models.manifest.json pickRules（与 glb URL 最长 match）。
 * 可在 binding 上设 `"syncAttractionDb": false` 仅更新模型不写库。
 *
 * @param {{ dryRun?: boolean, silent?: boolean, syncAttractionDb?: boolean }} [opts]
 * @returns {Promise<{ updated: number, skipped: number, errors: string[], dbUpdated: number }>}
 */
export async function syncGlbPoiBindings(opts = {}) {
  const { dryRun = false, silent = false } = opts;
  const syncDb = opts.syncAttractionDb !== false;
  const log = silent ? () => {} : console.log;
  const warn = silent ? () => {} : console.warn;

  const { bindingsPath, transformsPath, geoPath, manifestPath } = glbPoiBindingsPaths();
  const ref = readGeoReferenceFromDisk(geoPath);
  if (!ref) throw new Error("无法读取 geo_reference.json");

  if (!fs.existsSync(bindingsPath)) {
    return { updated: 0, skipped: 0, errors: [], dbUpdated: 0 };
  }

  const bindDoc = JSON.parse(fs.readFileSync(bindingsPath, "utf8"));
  const bindings = Array.isArray(bindDoc.bindings) ? bindDoc.bindings : [];
  if (!bindings.length) {
    return { updated: 0, skipped: 0, errors: [], dbUpdated: 0 };
  }

  const pickRules = loadPickRules(manifestPath);
  const glbUrls = listOptimizedGlbUrls();

  const raw = fs.existsSync(transformsPath)
    ? fs.readFileSync(transformsPath, "utf8")
    : '{"rules":[]}';
  const doc = JSON.parse(raw);
  const rules = Array.isArray(doc.rules) ? doc.rules : [];
  const defaultCity = process.env.AMAP_CITY || "上海";

  let updated = 0;
  let skipped = 0;
  const errors = [];
  let dbUpdated = 0;

  const getRow = db.prepare(`SELECT id, position_y FROM attractions WHERE id = ?`);
  const updAttr = db.prepare(`
    UPDATE attractions SET
      gcj_lat = @gcj_lat,
      gcj_lng = @gcj_lng,
      position_x = @position_x,
      position_z = @position_z,
      amap_id = @amap_id,
      address = @address,
      poi_type = @poi_type,
      tel = @tel,
      source = @source
    WHERE id = @id
  `);

  if (syncDb && !dryRun) {
    try {
      ensureAttractionsAuxColumns(db);
    } catch (e) {
      warn("[glb-poi] ensureAttractionsAuxColumns:", e?.message || e);
    }
  }

  for (const b of bindings) {
    const matchGlb = b.matchGlb;
    const q = b.poiQuery || b.poiKeywords;
    if (!matchGlb || !q) {
      skipped += 1;
      warn("跳过无效 binding（缺少 matchGlb 或 poiQuery）:", b);
      continue;
    }
    try {
      const city = b.city || defaultCity;
      log(`[glb-poi] ${matchGlb} ← 「${q}」…`);
      const poi = await amapPlaceFirstRaw(q, city);
      const { x, z } = latLngToSceneXZ(poi.lat, poi.lng, ref);

      let rule = rules.find((r) => String(r.match) === String(matchGlb));
      if (!rule) {
        rule = { match: matchGlb, position: [0, 0, 0], rotationDeg: [0, 0, 0], scale: 1 };
        rules.push(rule);
        log(`  新建 model_transforms rule: ${matchGlb}`);
      }
      const prev = Array.isArray(rule.position) ? rule.position : [0, 0, 0];
      const keepY = b.keepPositionY !== false;
      const y = keepY ? Number(prev[1] ?? 0) : Number(b.positionY ?? 0);
      rule.position = [x, y, z];
      log(`  → ${poi.name} scene [${x.toFixed(2)}, ${y}, ${z.toFixed(2)}]`);
      updated += 1;

      const bindingSyncDb = b.syncAttractionDb !== false && syncDb;
      if (bindingSyncDb && !dryRun) {
        const aid = resolveAttractionIdForBinding(
          matchGlb,
          glbUrls,
          pickRules,
          typeof b.attractionId === "string" ? b.attractionId : undefined
        );
        if (!aid) {
          warn(
            `  未解析到景点 id（请在 binding 中加 \"attractionId\": \"…\"，或在 models.manifest.json pickRules 里为该 glb 配置 pickableAttractionId），跳过写库`
          );
        } else {
          const row = getRow.get(aid);
          if (!row) {
            warn(`  数据库无 attractions.id=${aid}，跳过写库`);
          } else {
            const py = Number(row.position_y ?? 0);
            updAttr.run({
              id: aid,
              gcj_lat: poi.lat,
              gcj_lng: poi.lng,
              position_x: x,
              position_z: z,
              amap_id: poi.amapId,
              address: poi.address || null,
              poi_type: poi.typecode || poi.type || null,
              tel: poi.tel || null,
              source: "glb_poi_binding",
            });
            log(
              `  → attractions.${aid} 蓝球 xz / gcj 已与 POI、model_transforms 对齐（position_y=${py} 未改；可再改 model_transforms 微调模型）`
            );
            dbUpdated += 1;
          }
        }
      }
    } catch (e) {
      errors.push(`${matchGlb}: ${e?.message || e}`);
      warn(`[glb-poi] 失败 ${matchGlb}:`, e?.message || e);
    }
  }

  if (!dryRun && updated > 0) {
    fs.writeFileSync(transformsPath, `${JSON.stringify({ ...doc, rules }, null, 2)}\n`, "utf8");
    log(`[glb-poi] 已写入 ${transformsPath}（${updated} 条）`);
  }

  return { updated, skipped, errors, dbUpdated };
}
