import { getAttractionById } from "../models/Attraction.js";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "./geoProject.js";
import { buildBaiduSceneWalkDetailed } from "./baiduWalkingSceneRoute.js";
import { buildAmapSceneWalkDetailed } from "./amapWalkingSceneRoute.js";
import { clipWalkResult } from "./parkBoundaryClip.js";
import { findPath, pathDistance, sceneDistToMeters, walkDurationSeconds } from "./parkRoadGraphService.js";

/**
 * 百度失败 → 高德；仍失败 → 景点直线兜底（保证 smart-plan 不因步行 API 整单失败）。
 * @param {string[]} attractionIdsInOrder
 * @param {{ gcj_lat: number, gcj_lng: number, scene_x: number, scene_z: number } | null} [startPosition]
 */
export async function buildSceneWalkDetailed(attractionIdsInOrder, startPosition = null) {
  const ids = [...attractionIdsInOrder].filter(Boolean);
  if (ids.length < 2 && !(ids.length === 1 && startPosition)) {
    return { points: [], distanceMeters: 0, durationSeconds: 0, segments: [], provider: "none" };
  }

  // ── 优先使用 park_roads 路网图寻路 ──────────────────────────────
  const parkRoadResult = tryParkRoadRoute(ids, startPosition);
  if (parkRoadResult) {
    console.log(`[walk] park-road 多段寻路成功: ${parkRoadResult.points.length} 点, ${parkRoadResult.distanceMeters}m`);
    return parkRoadResult;
  }

  // ── fallback: 百度/高德 API ────────────────────────────────────
  const prefer = (process.env.WALK_ROUTE_PROVIDER || "baidu-then-amap").toLowerCase();

  if (prefer === "amap") {
    try {
      const walk = await buildAmapSceneWalkDetailed(ids, startPosition);
      return clipWalkResult({ ...walk, provider: "amap" });
    } catch (e) {
      console.warn("[walk] 高德步行失败:", e?.message || e);
      return clipWalkResult({ ...buildStraightLineWalkFallback(ids, startPosition), provider: "straight" });
    }
  }

  if (prefer === "baidu") {
    try {
      const walk = await buildBaiduSceneWalkDetailed(ids, startPosition);
      return clipWalkResult({ ...walk, provider: "baidu" });
    } catch (e) {
      console.warn("[walk] 百度步行失败:", e?.message || e);
      return clipWalkResult({ ...buildStraightLineWalkFallback(ids, startPosition), provider: "straight" });
    }
  }

  // 默认 baidu-then-amap
  try {
    const walk = await buildBaiduSceneWalkDetailed(ids, startPosition);
    return clipWalkResult({ ...walk, provider: "baidu" });
  } catch (bErr) {
    console.warn("[walk] 百度步行失败，尝试高德:", bErr?.message || bErr);
  }

  try {
    const walk = await buildAmapSceneWalkDetailed(ids, startPosition);
    return clipWalkResult({ ...walk, provider: "amap" });
  } catch (aErr) {
    console.warn("[walk] 高德步行失败，使用直线估算:", aErr?.message || aErr);
    return clipWalkResult({ ...buildStraightLineWalkFallback(ids, startPosition), provider: "straight" });
  }
}

/**
 * 尝试使用 park_roads 路网图对多段行程进行寻路。
 * 所有段均成功时返回结果，任一段失败返回 null（由调用方 fallback）。
 * @param {string[]} ids
 * @param {{ gcj_lat?: number, gcj_lng?: number, scene_x?: number, scene_z?: number } | null} startPosition
 * @returns {{ points: Array, distanceMeters: number, durationSeconds: number, segments: Array, provider: string } | null}
 */
function tryParkRoadRoute(ids, startPosition) {
  try {
    const waypoints = []; // [{ id, name, x, z }]

    // 构建起点
    if (startPosition) {
      let sx, sz;
      if (startPosition.scene_x != null && startPosition.scene_z != null) {
        sx = Number(startPosition.scene_x);
        sz = Number(startPosition.scene_z);
      } else if (startPosition.gcj_lat != null && startPosition.gcj_lng != null) {
        const ref = readGeoReferenceFromDisk();
        if (!ref) return null;
        const sc = latLngToSceneXZ(startPosition.gcj_lat, startPosition.gcj_lng, ref);
        sx = sc.x; sz = sc.z;
      }
      if (sx != null && sz != null) {
        waypoints.push({ id: "__lbs__", name: "我的位置", x: sx, z: sz });
      }
    }

    // 构建景点节点
    for (const aid of ids) {
      const a = getAttractionById(aid);
      if (!a) return null; // 景点不存在，fallback
      const ax = Number(a.position_x);
      const az = Number(a.position_z);
      if (!isFinite(ax) || !isFinite(az)) return null;
      waypoints.push({ id: a.id, name: a.name, x: ax, z: az });
    }

    if (waypoints.length < 2) return null;

    // 逐段寻路
    const allPoints = [];
    const segments = [];
    let totalDist = 0;
    let totalDur = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const legPath = findPath(from.x, from.z, to.x, to.z);
      if (!legPath || legPath.length < 2) return null; // 任一段失败则整体 fallback

      const legSceneDist = pathDistance(legPath);
      const legMeters = Math.round(sceneDistToMeters(legSceneDist));
      const legSeconds = walkDurationSeconds(legMeters);
      totalDist += legMeters;
      totalDur += legSeconds;

      // 拼接点：避免相邻段起终点重复
      const startIdx = (allPoints.length > 0) ? 1 : 0;
      for (let j = startIdx; j < legPath.length; j++) {
        allPoints.push(legPath[j]);
      }

      segments.push({
        fromId: from.id,
        toId: to.id,
        fromName: from.name,
        toName: to.name,
        distanceMeters: legMeters,
        durationSeconds: legSeconds,
        points: legPath,
      });
    }

    return {
      points: allPoints,
      distanceMeters: totalDist,
      durationSeconds: totalDur,
      segments,
      provider: "park-road",
    };
  } catch (e) {
    console.warn("[walk] park-road 多段寻路失败, fallback:", e?.message || e);
    return null;
  }
}

/** @param {string[]} ids
 * @param {{ gcj_lat: number, gcj_lng: number, scene_x: number, scene_z: number } | null} [startPosition]
 */
function buildStraightLineWalkFallback(ids, startPosition = null) {
  const ref = readGeoReferenceFromDisk();
  if (!ref) throw new Error("geo_reference.json 缺失或无效");

  const points3d = [];
  const segments = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  // 首段：startPosition → ids[0]
  if (startPosition && ids.length >= 1) {
    const b = getAttractionById(ids[0]);
    if (b) {
      let ax, az;
      if (startPosition.scene_x != null && startPosition.scene_z != null) {
        ax = Number(startPosition.scene_x);
        az = Number(startPosition.scene_z);
      } else if (startPosition.gcj_lat != null && startPosition.gcj_lng != null) {
        const sc = latLngToSceneXZ(startPosition.gcj_lat, startPosition.gcj_lng, ref);
        ax = sc.x; az = sc.z;
      }
      if (ax != null && az != null) {
      const bx = Number(b.position_x);
      const bz = Number(b.position_z);
      const legPoints = [
        { x: ax, y: 0.85, z: az },
        { x: bx, y: 0.85, z: bz },
      ];
      points3d.push(...legPoints);
      const dx = bx - ax;
      const dz = bz - az;
      const sceneDist = Math.sqrt(dx * dx + dz * dz);
      const legM = Math.max(20, Math.round(sceneDist * 8));
      const legS = Math.max(60, Math.round(legM * 1.1));
      distanceMeters += legM;
      durationSeconds += legS;
      segments.push({
        fromId: "__lbs__",
        toId: b.id,
        fromName: "我的位置",
        toName: b.name,
        distanceMeters: legM,
        durationSeconds: legS,
        points: legPoints,
      });
      }
    }
  }

  for (let i = 0; i < ids.length - 1; i++) {
    const a = getAttractionById(ids[i]);
    const b = getAttractionById(ids[i + 1]);
    if (!a || !b) continue;

    const ax = Number(a.position_x);
    const az = Number(a.position_z);
    const bx = Number(b.position_x);
    const bz = Number(b.position_z);
    const legPoints = [
      { x: ax, y: 0.85, z: az },
      { x: bx, y: 0.85, z: bz },
    ];

    if (points3d.length) {
      const last = points3d[points3d.length - 1];
      if (Math.abs(last.x - ax) > 1e-4 || Math.abs(last.z - az) > 1e-4) {
        points3d.push(legPoints[0]);
      }
      points3d.push(legPoints[1]);
    } else {
      points3d.push(...legPoints);
    }

    const dx = bx - ax;
    const dz = bz - az;
    const sceneDist = Math.sqrt(dx * dx + dz * dz);
    const legM = Math.max(20, Math.round(sceneDist * 8));
    const legS = Math.max(60, Math.round(legM * 1.1));
    distanceMeters += legM;
    durationSeconds += legS;

    segments.push({
      fromId: a.id,
      toId: b.id,
      fromName: a.name,
      toName: b.name,
      distanceMeters: legM,
      durationSeconds: legS,
      points: legPoints,
    });
  }

  return {
    points: points3d,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(durationSeconds),
    segments,
  };
}
