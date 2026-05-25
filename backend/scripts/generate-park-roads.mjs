#!/usr/bin/env node
/**
 * 生成园区静态路网（白色道路）数据 — 扩展版。
 *
 * 除了景点对之外，还引入了虚拟「路口节点 (waypoint)」使路网更密集、
 * 更贴合实际步行道路。
 *
 * 前置：backend/.env 中配置 AMAP_WEB_KEY；attractions 表已有 gcj_lat/lng。
 *
 * 用法（在 backend 目录）：
 *   node scripts/generate-park-roads.mjs
 *   node scripts/generate-park-roads.mjs --fallback-only   # 不调高德，全部走直线
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
const outPath = path.join(
  repoRoot,
  "frontend",
  "assets",
  "data",
  "park_roads.json"
);

/* ===================================================================
 * 虚拟路口节点 (waypoint)
 * 坐标为 GCJ-02，根据高德地图截图 + 已知景点坐标推算
 * =================================================================== */
const WAYPOINTS = {
  // ---- 入口 / 米奇大街 ----
  "wp-entrance": { lat: 31.13985, lng: 121.65955 },
  "wp-mickey-s": { lat: 31.14045, lng: 121.65960 },
  "wp-mickey-mid": { lat: 31.14105, lng: 121.65958 },
  "wp-mickey-n": { lat: 31.14175, lng: 121.65955 },

  // ---- 中心广场 / 奇想花园 ----
  "wp-hub-south": { lat: 31.14230, lng: 121.65960 },
  "wp-hub-center": { lat: 31.14290, lng: 121.65965 },
  "wp-garden-e": { lat: 31.14270, lng: 121.66050 },
  "wp-garden-se": { lat: 31.14220, lng: 121.66080 },

  // ---- 城堡环路 ----
  "wp-castle-s": { lat: 31.14310, lng: 121.65960 },
  "wp-castle-e": { lat: 31.14360, lng: 121.66060 },
  "wp-castle-w": { lat: 31.14360, lng: 121.65870 },
  "wp-castle-n": { lat: 31.14420, lng: 121.65960 },

  // ---- 明日世界 ----
  "wp-tomorrow-e": { lat: 31.14210, lng: 121.65900 },
  "wp-tomorrow-center": { lat: 31.14180, lng: 121.65860 },
  "wp-tomorrow-w": { lat: 31.14160, lng: 121.65810 },

  // ---- 玩具总动园 ----
  "wp-toystory-e": { lat: 31.14350, lng: 121.65780 },
  "wp-toystory-s": { lat: 31.14310, lng: 121.65740 },

  // ---- 梦幻世界 ----
  "wp-fantasy-s": { lat: 31.14400, lng: 121.65900 },
  "wp-fantasy-center": { lat: 31.14460, lng: 121.65920 },
  "wp-fantasy-n": { lat: 31.14530, lng: 121.65940 },
  "wp-fantasy-e": { lat: 31.14450, lng: 121.66000 },

  // ---- 宝藏湾 ----
  "wp-treasure-w": { lat: 31.14350, lng: 121.66140 },
  "wp-treasure-center": { lat: 31.14420, lng: 121.66200 },
  "wp-treasure-n": { lat: 31.14480, lng: 121.66220 },

  // ---- 探险岛 ----
  "wp-adventure-w": { lat: 31.14370, lng: 121.66300 },
  "wp-adventure-n": { lat: 31.14430, lng: 121.66420 },
  "wp-adventure-s": { lat: 31.14310, lng: 121.66380 },

  // ---- 疯狂动物城 ----
  "wp-zootopia-s": { lat: 31.14580, lng: 121.65960 },
  "wp-zootopia-w": { lat: 31.14620, lng: 121.65900 },
};

/* ===================================================================
 * 路网拓扑：短路径段
 * 每项可以是 [attractionId, attractionId]
 *           或 [waypointId, attractionId]
 *           或 [waypointId, waypointId]
 * =================================================================== */
const ROAD_PAIRS = [
  // ======= 米奇大街 (入口→城堡中轴线) =======
  ["wp-entrance", "wp-mickey-s"],
  ["wp-mickey-s", "wp-mickey-mid"],
  ["wp-mickey-mid", "wp-mickey-n"],
  ["wp-mickey-n", "wp-hub-south"],
  ["wp-hub-south", "wp-hub-center"],
  ["wp-hub-center", "wp-castle-s"],
  ["wp-castle-s", "castle"],

  // ======= 城堡环路 =======
  ["castle", "wp-castle-e"],
  ["castle", "wp-castle-w"],
  ["castle", "wp-castle-n"],
  ["wp-castle-e", "wp-castle-n"],
  ["wp-castle-w", "wp-castle-n"],
  ["wp-castle-s", "wp-castle-e"],
  ["wp-castle-s", "wp-castle-w"],

  // ======= 奇想花园区域 =======
  ["wp-hub-center", "wp-garden-e"],
  ["wp-garden-e", "fantasia-carousel"],
  ["wp-garden-e", "wp-garden-se"],
  ["wp-hub-center", "dumbo"],
  ["dumbo", "fantasia-carousel"],

  // ======= 明日世界 =======
  ["wp-hub-south", "wp-tomorrow-e"],
  ["wp-tomorrow-e", "wp-tomorrow-center"],
  ["wp-tomorrow-center", "wp-tomorrow-w"],
  ["wp-tomorrow-center", "jet-packs"],
  ["wp-tomorrow-w", "stitch-encounter"],
  ["wp-tomorrow-e", "marvel-universe"],
  ["marvel-universe", "buzz"],
  ["buzz", "tron"],
  ["wp-castle-w", "tron"],

  // ======= 玩具总动园 =======
  ["wp-castle-w", "wp-toystory-e"],
  ["wp-toystory-e", "wp-toystory-s"],
  ["wp-toystory-e", "slinky-dog-spin"],
  ["wp-toystory-s", "rex-racer"],
  ["slinky-dog-spin", "woody-roundup"],
  ["woody-roundup", "rex-racer"],
  ["wp-toystory-e", "peter-pan"],

  // ======= 梦幻世界 =======
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

  // ======= 宝藏湾 =======
  ["wp-castle-e", "wp-treasure-w"],
  ["wp-treasure-w", "wp-treasure-center"],
  ["wp-treasure-center", "explorer-canoes"],
  ["wp-treasure-center", "wp-treasure-n"],
  ["wp-treasure-n", "shipwreck-shore"],
  ["wp-treasure-w", "pirates"],
  ["explorer-canoes", "shipwreck-shore"],

  // ======= 探险岛 =======
  ["wp-treasure-center", "wp-adventure-w"],
  ["wp-adventure-w", "wp-adventure-n"],
  ["wp-adventure-w", "wp-adventure-s"],
  ["wp-adventure-n", "camp-discovery"],
  ["wp-adventure-n", "soaring"],
  ["wp-adventure-s", "thunder"],
  ["soaring", "camp-discovery"],
  ["thunder", "camp-discovery"],
  ["wp-garden-se", "wp-adventure-s"],

  // ======= 疯狂动物城 =======
  ["wp-fantasy-n", "wp-zootopia-s"],
  ["wp-zootopia-s", "zootopia-hot-pursuit"],
  ["wp-zootopia-s", "wp-zootopia-w"],
  ["wp-zootopia-w", "pooh"],
  ["wp-zootopia-w", "zootopia-hot-pursuit"],

  // ======= 区域间连接 =======
  ["wp-hub-south", "wp-garden-se"],
  ["wp-garden-se", "fantasia-carousel"],
  ["pirates", "wp-tomorrow-e"],
  ["wp-castle-e", "fantasia-carousel"],
];

const ROAD_Y = 0.3;
const FALLBACK_ONLY = process.argv.includes("--fallback-only");
const MAX_EDGE_M = 2.5;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 获取节点坐标（支持景点ID和waypoint ID）
 * @returns {{ lat: number, lng: number } | null}
 */
function getNodeCoords(nodeId) {
  // 先查 waypoint
  if (WAYPOINTS[nodeId]) {
    return WAYPOINTS[nodeId];
  }
  // 再查 attraction
  const a = getAttractionById(nodeId);
  if (a && a.gcj_lat != null && a.gcj_lng != null) {
    return { lat: Number(a.gcj_lat), lng: Number(a.gcj_lng) };
  }
  return null;
}

/**
 * 直线 fallback：把 a/b 两点 GCJ 经纬度密集化后投影到场景。
 */
function fallbackStraight(coordA, coordB, ref) {
  const dense = densifyLatLngRing(
    [
      { lat: coordA.lat, lng: coordA.lng },
      { lat: coordB.lat, lng: coordB.lng },
    ],
    MAX_EDGE_M
  );
  const pts = [];
  for (const { lat, lng } of dense) {
    const { x, z } = latLngToSceneXZ(lat, lng, ref);
    pts.push({ x, y: ROAD_Y, z });
  }
  return clipRouteToPark(pts).map((p) => ({ x: p.x, y: ROAD_Y, z: p.z }));
}

/**
 * 通过高德步行API获取路线并投影到场景坐标
 */
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
      if (last && Math.abs(last.x - x) < 1e-5 && Math.abs(last.z - z) < 1e-5)
        continue;
      pts.push({ x, y: ROAD_Y, z });
    }
  }
  return pts.length >= 2 ? pts : null;
}

async function buildRoad(idA, idB, ref) {
  const coordA = getNodeCoords(idA);
  const coordB = getNodeCoords(idB);
  if (!coordA) throw new Error(`无法获取坐标: ${idA}`);
  if (!coordB) throw new Error(`无法获取坐标: ${idB}`);

  if (!FALLBACK_ONLY) {
    try {
      const pts = await buildRoadViaAmap(coordA, coordB, ref);
      if (pts && pts.length >= 2) {
        const clipped = clipRouteToPark(pts).map((p) => ({
          x: p.x,
          y: ROAD_Y,
          z: p.z,
        }));
        if (clipped.length >= 2) return clipped;
      }
    } catch (err) {
      console.warn(
        `[park-roads] 高德失败 ${idA} → ${idB}: ${err.message}，使用直线 fallback`
      );
    }
  }
  // fallback: 直线 + 边界裁剪
  return fallbackStraight(coordA, coordB, ref);
}

async function main() {
  const ref = readGeoReferenceFromDisk();
  if (!ref) throw new Error("geo_reference.json 缺失或无效");

  const roads = [];
  for (let i = 0; i < ROAD_PAIRS.length; i++) {
    const [idA, idB] = ROAD_PAIRS[i];
    process.stdout.write(
      `[${i + 1}/${ROAD_PAIRS.length}] ${idA} ↔ ${idB} ... `
    );
    try {
      const points = await buildRoad(idA, idB, ref);
      if (points.length < 2) {
        console.log(`跳过（点数不足: ${points.length}）`);
        continue;
      }
      roads.push({ id: `${idA}__${idB}`, points });
      console.log(`OK (${points.length} pts)`);
    } catch (err) {
      console.log(`失败: ${err.message}`);
    }
    // 高德 QPS 限制：温和节流
    if (!FALLBACK_ONLY) await sleep(250);
  }

  const out = {
    _comment:
      "园区静态路网（白色道路）。由 backend/scripts/generate-park-roads.mjs 生成；前端 sceneLines.setParkRoads 渲染。",
    generatedAt: new Date().toISOString(),
    yHeight: ROAD_Y,
    roads,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`\n写入 ${outPath}（共 ${roads.length} 条路）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
