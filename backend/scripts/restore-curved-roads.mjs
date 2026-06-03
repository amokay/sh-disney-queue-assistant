#!/usr/bin/env node
/**
 * 恢复被误删的弯曲路线 + 删除指定坐标附近的路线。
 *
 * 步骤：
 *   1) 读取当前 park_roads.json 中的 roads
 *   2) 比对 generate-park-roads.mjs 的 ROAD_PAIRS，找出缺失的、且 id 包含
 *      treasure/adventure/pirates/explorer/canoes/shipwreck 关键词的路线
 *   3) 通过高德步行 API 重新生成这些路线
 *   4) 仅保留真正弯曲的路线（ratio > 1.2 且 offsetRatio > 15%）
 *   5) 删除任意点距 (x=-26.2, z=-4.6) < 5 场景单位的所有路线
 *   6) 写回 park_roads.json
 *
 * 用法（在 backend 目录）：
 *   node scripts/restore-curved-roads.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "../loadEnv.js";
import { getAttractionById } from "../models/Attraction.js";
import { amapDirectionWalking } from "../services/amapWebService.js";
import {
  readGeoReferenceFromDisk,
  latLngToSceneXZ,
} from "../services/geoProject.js";
import {
  densifyLatLngRing,
  parseLngLatSemicolonPolyline,
} from "../services/walkRouteGeo.js";
import { clipRouteToPark } from "../services/parkBoundaryClip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");
const ROADS_PATH = path.join(
  repoRoot,
  "frontend",
  "assets",
  "data",
  "park_roads.json"
);

// 需要重点恢复的关键词（探险岛/宝藏湾区域）
const ZONE_KEYWORDS = [
  "treasure",
  "adventure",
  "pirates",
  "explorer",
  "canoes",
  "shipwreck",
];

// 被删除坐标（距离阈值内的路线全部移除）
const DELETE_NEAR_POINT = { x: -26.2, z: -4.6 };
const DELETE_RADIUS = 5;

// 弯曲度阈值（仅保留真正弯曲的路线）
const KEEP_RATIO = 1.2;
const KEEP_OFFSET_RATIO = 0.15;

// 与 generate-park-roads.mjs 保持一致的虚拟节点
const WAYPOINTS = {
  "wp-entrance": { lat: 31.13985, lng: 121.65955 },
  "wp-mickey-s": { lat: 31.14045, lng: 121.65960 },
  "wp-mickey-mid": { lat: 31.14105, lng: 121.65958 },
  "wp-mickey-n": { lat: 31.14175, lng: 121.65955 },
  "wp-hub-south": { lat: 31.14230, lng: 121.65960 },
  "wp-hub-center": { lat: 31.14290, lng: 121.65965 },
  "wp-garden-e": { lat: 31.14270, lng: 121.66050 },
  "wp-garden-se": { lat: 31.14220, lng: 121.66080 },
  "wp-castle-s": { lat: 31.14310, lng: 121.65960 },
  "wp-castle-e": { lat: 31.14360, lng: 121.66060 },
  "wp-castle-w": { lat: 31.14360, lng: 121.65870 },
  "wp-castle-n": { lat: 31.14420, lng: 121.65960 },
  "wp-tomorrow-e": { lat: 31.14210, lng: 121.65900 },
  "wp-tomorrow-center": { lat: 31.14180, lng: 121.65860 },
  "wp-tomorrow-w": { lat: 31.14160, lng: 121.65810 },
  "wp-toystory-e": { lat: 31.14350, lng: 121.65780 },
  "wp-toystory-s": { lat: 31.14310, lng: 121.65740 },
  "wp-fantasy-s": { lat: 31.14400, lng: 121.65900 },
  "wp-fantasy-center": { lat: 31.14460, lng: 121.65920 },
  "wp-fantasy-n": { lat: 31.14530, lng: 121.65940 },
  "wp-fantasy-e": { lat: 31.14450, lng: 121.66000 },
  "wp-treasure-w": { lat: 31.14350, lng: 121.66140 },
  "wp-treasure-center": { lat: 31.14420, lng: 121.66200 },
  "wp-treasure-n": { lat: 31.14480, lng: 121.66220 },
  "wp-adventure-w": { lat: 31.14370, lng: 121.66300 },
  "wp-adventure-n": { lat: 31.14430, lng: 121.66420 },
  "wp-adventure-s": { lat: 31.14310, lng: 121.66380 },
  "wp-zootopia-s": { lat: 31.14580, lng: 121.65960 },
  "wp-zootopia-w": { lat: 31.14620, lng: 121.65900 },
};

const ROAD_PAIRS = [
  ["wp-entrance", "wp-mickey-s"],
  ["wp-mickey-s", "wp-mickey-mid"],
  ["wp-mickey-mid", "wp-mickey-n"],
  ["wp-mickey-n", "wp-hub-south"],
  ["wp-hub-south", "wp-hub-center"],
  ["wp-hub-center", "wp-castle-s"],
  ["wp-castle-s", "castle"],
  ["castle", "wp-castle-e"],
  ["castle", "wp-castle-w"],
  ["castle", "wp-castle-n"],
  ["wp-castle-e", "wp-castle-n"],
  ["wp-castle-w", "wp-castle-n"],
  ["wp-castle-s", "wp-castle-e"],
  ["wp-castle-s", "wp-castle-w"],
  ["wp-hub-center", "wp-garden-e"],
  ["wp-garden-e", "fantasia-carousel"],
  ["wp-garden-e", "wp-garden-se"],
  ["wp-hub-center", "dumbo"],
  ["dumbo", "fantasia-carousel"],
  ["wp-hub-south", "wp-tomorrow-e"],
  ["wp-tomorrow-e", "wp-tomorrow-center"],
  ["wp-tomorrow-center", "wp-tomorrow-w"],
  ["wp-tomorrow-center", "jet-packs"],
  ["wp-tomorrow-w", "stitch-encounter"],
  ["wp-tomorrow-e", "marvel-universe"],
  ["marvel-universe", "buzz"],
  ["buzz", "tron"],
  ["wp-castle-w", "tron"],
  ["wp-castle-w", "wp-toystory-e"],
  ["wp-toystory-e", "wp-toystory-s"],
  ["wp-toystory-e", "slinky-dog-spin"],
  ["wp-toystory-s", "rex-racer"],
  ["slinky-dog-spin", "woody-roundup"],
  ["woody-roundup", "rex-racer"],
  ["wp-toystory-e", "peter-pan"],
  ["wp-castle-n", "wp-fantasy-s"],
  ["wp-fantasy-s", "wp-fantasy-center"],
  ["wp-fantasy-center", "wp-fantasy-n"],
  ["wp-fantasy-s", "voyage-crystal-grotto"],
  ["wp-fantasy-s", "peter-pan"],
  ["wp-fantasy-center", "alice-maze"],
  ["wp-fantasy-center", "hunny-pot-spin"],
  ["wp-fantasy-n", "mine"],
  ["wp-fantasy-n", "pooh"],
  ["mine", "pooh"],
  ["alice-maze", "mine"],
  ["hunny-pot-spin", "alice-maze"],
  ["wp-fantasy-e", "wp-castle-n"],
  ["wp-fantasy-e", "alice-maze"],
  ["wp-castle-e", "wp-treasure-w"],
  ["wp-treasure-w", "wp-treasure-center"],
  ["wp-treasure-center", "explorer-canoes"],
  ["wp-treasure-center", "wp-treasure-n"],
  ["wp-treasure-n", "shipwreck-shore"],
  ["wp-treasure-w", "pirates"],
  ["explorer-canoes", "shipwreck-shore"],
  ["wp-treasure-center", "wp-adventure-w"],
  ["wp-adventure-w", "wp-adventure-n"],
  ["wp-adventure-w", "wp-adventure-s"],
  ["wp-adventure-n", "camp-discovery"],
  ["wp-adventure-n", "soaring"],
  ["wp-adventure-s", "thunder"],
  ["soaring", "camp-discovery"],
  ["thunder", "camp-discovery"],
  ["wp-garden-se", "wp-adventure-s"],
  ["wp-fantasy-n", "wp-zootopia-s"],
  ["wp-zootopia-s", "zootopia-hot-pursuit"],
  ["wp-zootopia-s", "wp-zootopia-w"],
  ["wp-zootopia-w", "pooh"],
  ["wp-zootopia-w", "zootopia-hot-pursuit"],
  ["wp-hub-south", "wp-garden-se"],
  ["wp-garden-se", "fantasia-carousel"],
  ["pirates", "wp-tomorrow-e"],
  ["wp-castle-e", "fantasia-carousel"],
];

const ROAD_Y = 0.3;
const MAX_EDGE_M = 2.5;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function perpDist(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return dist2D(p, a);
  const cross = (p.x - a.x) * dz - (p.z - a.z) * dx;
  return Math.abs(cross) / len;
}

function evaluateCurvature(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { ratio: 0, offsetRatio: 0, startEndDist: 0, pathLen: 0 };
  }
  const start = points[0];
  const end = points[points.length - 1];
  const startEndDist = dist2D(start, end);
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    pathLen += dist2D(points[i - 1], points[i]);
  }
  const ratio = startEndDist > 1e-6 ? pathLen / startEndDist : 0;
  let maxOffset = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], start, end);
    if (d > maxOffset) maxOffset = d;
  }
  const offsetRatio = pathLen > 1e-6 ? maxOffset / pathLen : 0;
  return { ratio, offsetRatio, startEndDist, pathLen };
}

function getNodeCoords(nodeId) {
  if (WAYPOINTS[nodeId]) return WAYPOINTS[nodeId];
  const a = getAttractionById(nodeId);
  if (a && a.gcj_lat != null && a.gcj_lng != null) {
    return { lat: Number(a.gcj_lat), lng: Number(a.gcj_lng) };
  }
  return null;
}

async function buildRoadViaAmap(coordA, coordB, ref) {
  const origin = `${coordA.lng},${coordA.lat}`;
  const dest = `${coordB.lng},${coordB.lat}`;
  const j = await amapDirectionWalking(origin, dest);
  const routePath = j?.route?.paths?.[0];
  if (!routePath) return null;
  const steps = Array.isArray(routePath.steps) ? routePath.steps : [];
  const pts = [];
  for (const step of steps) {
    const seg = parseLngLatSemicolonPolyline(step.polyline);
    const dense = densifyLatLngRing(seg, MAX_EDGE_M);
    for (const { lat, lng } of dense) {
      const { x, z } = latLngToSceneXZ(lat, lng, ref);
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - x) < 1e-5 && Math.abs(last.z - z) < 1e-5) {
        continue;
      }
      pts.push({ x, y: ROAD_Y, z });
    }
  }
  return pts.length >= 2 ? pts : null;
}

function passesNearDeletePoint(points) {
  if (!Array.isArray(points)) return false;
  for (const p of points) {
    const dx = p.x - DELETE_NEAR_POINT.x;
    const dz = p.z - DELETE_NEAR_POINT.z;
    if (Math.sqrt(dx * dx + dz * dz) < DELETE_RADIUS) return true;
  }
  return false;
}

async function main() {
  const ref = readGeoReferenceFromDisk();
  if (!ref) throw new Error("geo_reference.json 缺失或无效");

  const data = JSON.parse(fs.readFileSync(ROADS_PATH, "utf8"));
  const existingRoads = Array.isArray(data.roads) ? data.roads : [];
  const existingIds = new Set(existingRoads.map((r) => r.id));

  // 找出缺失的、且属于宝藏湾/探险岛区域的路线对
  const missing = [];
  for (const [a, b] of ROAD_PAIRS) {
    const id = `${a}__${b}`;
    if (existingIds.has(id)) continue;
    const inZone = ZONE_KEYWORDS.some(
      (k) => a.includes(k) || b.includes(k)
    );
    if (!inZone) continue;
    missing.push([a, b, id]);
  }

  console.log(`=== 需重新生成的候选路线 ${missing.length} 条 ===`);
  missing.forEach(([a, b]) => console.log(`  - ${a} → ${b}`));

  // 通过高德重新生成
  const restored = [];
  const skipped = [];
  for (let i = 0; i < missing.length; i++) {
    const [a, b, id] = missing[i];
    process.stdout.write(`[${i + 1}/${missing.length}] ${id} ... `);
    const coordA = getNodeCoords(a);
    const coordB = getNodeCoords(b);
    if (!coordA || !coordB) {
      console.log(`无坐标，跳过`);
      skipped.push({ id, reason: "no-coord" });
      continue;
    }
    try {
      const raw = await buildRoadViaAmap(coordA, coordB, ref);
      if (!raw || raw.length < 2) {
        console.log(`API 返回为空`);
        skipped.push({ id, reason: "amap-empty" });
        continue;
      }
      const clipped = clipRouteToPark(raw).map((p) => ({
        x: p.x,
        y: ROAD_Y,
        z: p.z,
      }));
      if (clipped.length < 2) {
        console.log(`裁剪后点数不足`);
        skipped.push({ id, reason: "clipped-too-few" });
        continue;
      }
      const { ratio, offsetRatio, startEndDist } = evaluateCurvature(clipped);
      const isCurved = ratio > KEEP_RATIO && offsetRatio > KEEP_OFFSET_RATIO;
      console.log(
        `pts=${clipped.length}, dist=${startEndDist.toFixed(2)}, ratio=${ratio.toFixed(3)}, offset=${(offsetRatio * 100).toFixed(2)}% ${isCurved ? "✔ 保留" : "✘ 直线丢弃"}`
      );
      if (isCurved) {
        restored.push({ id, points: clipped });
      } else {
        skipped.push({
          id,
          reason: "straight",
          ratio: +ratio.toFixed(3),
          offsetRatio: +(offsetRatio * 100).toFixed(2),
        });
      }
    } catch (err) {
      console.log(`失败: ${err.message}`);
      skipped.push({ id, reason: `error:${err.message}` });
    }
    await sleep(250);
  }

  // 合并恢复后的路线
  const mergedRoads = [...existingRoads, ...restored];

  // 删除距 (x=-26.2, z=-4.6) < 5 场景单位的路线
  const finalRoads = [];
  const removedNearPoint = [];
  for (const road of mergedRoads) {
    if (passesNearDeletePoint(road.points)) {
      removedNearPoint.push(road.id);
    } else {
      finalRoads.push(road);
    }
  }

  console.log("");
  console.log(`=== 恢复 ${restored.length} 条弯曲路线 ===`);
  restored.forEach((r) => console.log(`  + ${r.id} (${r.points.length} pts)`));
  console.log("");
  console.log(`=== 跳过 ${skipped.length} 条（直线/失败） ===`);
  skipped.forEach((r) =>
    console.log(`  - ${r.id} (${r.reason}${r.ratio ? `, ratio=${r.ratio}, offset=${r.offsetRatio}%` : ""})`)
  );
  console.log("");
  console.log(
    `=== 删除距 (-26.2,-4.6) < ${DELETE_RADIUS} 单位的路线 ${removedNearPoint.length} 条 ===`
  );
  removedNearPoint.forEach((id) => console.log(`  x ${id}`));
  console.log("");
  console.log(
    `原路线: ${existingRoads.length}，恢复: +${restored.length}，按坐标删除: -${removedNearPoint.length}，最终: ${finalRoads.length}`
  );

  const out = {
    ...data,
    generatedAt: new Date().toISOString(),
    roads: finalRoads,
  };
  fs.writeFileSync(ROADS_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`已写入: ${ROADS_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

