import { getAttractionById } from "../models/Attraction.js";
import { readGeoReferenceFromDisk, sceneXZToLatLng, latLngToSceneXZ } from "./geoProject.js";
import { baiduDirectionWalkingGcj } from "./baiduWebService.js";
import { amapDirectionWalking } from "./amapWebService.js";
import { buildLegPoints } from "./baiduWalkingSceneRoute.js";
import { densifyLatLngRing, parseLngLatSemicolonPolyline } from "./walkRouteGeo.js";
import { clipWalkResult } from "./parkBoundaryClip.js";

const MAX_EDGE_M = 2.5;

/**
 * 从场景坐标（LBS）步行至指定景点，用于行中「我的位置 → 下一站」。
 * fallback 链：百度 → 高德 → 直线兜底（与整段路线一致，避免 LBS→下一站 单独退化）
 * @param {number} sceneX
 * @param {number} sceneZ
 * @param {string} attractionId
 */
export async function buildWalkFromSceneToAttraction(sceneX, sceneZ, attractionId) {
  const dest = getAttractionById(attractionId);
  if (!dest) throw new Error(`未知景点: ${attractionId}`);
  const ref = readGeoReferenceFromDisk();
  if (!ref) throw new Error("geo_reference.json 缺失或无效");

  const { lat: oLat, lng: oLng } = sceneXZToLatLng(sceneX, sceneZ, ref);
  const originPt = { gcj_lat: oLat, gcj_lng: oLng, name: "我的位置", id: "__lbs__" };

  if (dest.gcj_lat == null || dest.gcj_lng == null) {
    return clipWalkResult(straightFallback(sceneX, sceneZ, dest));
  }

  const prefer = (process.env.WALK_ROUTE_PROVIDER || "baidu-then-amap").toLowerCase();
  const tryBaidu = prefer !== "amap";
  const tryAmap = prefer !== "baidu";

  if (tryBaidu) {
    try {
      return clipWalkResult(await viaBaidu(sceneX, sceneZ, oLat, oLng, originPt, dest, ref));
    } catch (e) {
      console.warn("[walk] LBS→景点 百度失败:", e?.message || e);
    }
  }
  if (tryAmap) {
    try {
      return clipWalkResult(await viaAmap(sceneX, sceneZ, oLat, oLng, dest, ref));
    } catch (e) {
      console.warn("[walk] LBS→景点 高德失败:", e?.message || e);
    }
  }
  return clipWalkResult(straightFallback(sceneX, sceneZ, dest));
}

async function viaBaidu(sceneX, sceneZ, oLat, oLng, originPt, dest, ref) {
  const origin = `${Number(oLat)},${Number(oLng)}`;
  const destStr = `${Number(dest.gcj_lat)},${Number(dest.gcj_lng)}`;
  const j = await baiduDirectionWalkingGcj(origin, destStr);
  const route0 = Array.isArray(j?.result?.routes) ? j.result.routes[0] : null;
  if (!route0) throw new Error("百度无路径返回");

  const legDist = Number(route0.distance) || 0;
  const legDur = Number(route0.duration) || 0;
  const steps = Array.isArray(route0.steps) ? route0.steps : [];
  const legPoints = buildLegPoints(steps, ref, MAX_EDGE_M, originPt, dest);
  // 首点用精确 LBS scene 坐标，避免反投影漂移
  if (legPoints.length) legPoints[0] = { x: Number(sceneX), y: 0.85, z: Number(sceneZ) };

  return {
    points: legPoints,
    distanceMeters: Math.round(legDist),
    durationSeconds: Math.round(legDur),
    segments: [
      {
        fromId: "__lbs__",
        toId: dest.id,
        fromName: "我的位置",
        toName: dest.name,
        distanceMeters: Math.round(legDist),
        durationSeconds: Math.round(legDur),
        points: legPoints,
      },
    ],
    provider: "baidu",
  };
}

async function viaAmap(sceneX, sceneZ, oLat, oLng, dest, ref) {
  // 高德要求 "经度,纬度"
  const origin = `${Number(oLng)},${Number(oLat)}`;
  const destStr = `${Number(dest.gcj_lng)},${Number(dest.gcj_lat)}`;
  const j = await amapDirectionWalking(origin, destStr);
  const path = j?.route?.paths?.[0];
  if (!path) throw new Error("高德无路径返回");

  const legDist = Number(path.distance) || 0;
  const legDur = Number(path.duration) || 0;
  const steps = Array.isArray(path.steps) ? path.steps : [];

  const legPoints = [];
  for (const step of steps) {
    const seg = parseLngLatSemicolonPolyline(step.polyline);
    const dense = densifyLatLngRing(seg, MAX_EDGE_M);
    for (const { lat, lng } of dense) {
      const { x, z } = latLngToSceneXZ(lat, lng, ref);
      const last = legPoints[legPoints.length - 1];
      if (last && Math.abs(last.x - x) < 1e-5 && Math.abs(last.z - z) < 1e-5) continue;
      legPoints.push({ x, y: 0.85, z });
    }
  }
  if (legPoints.length === 0) {
    const denseFallback = densifyLatLngRing(
      [
        { lat: Number(oLat), lng: Number(oLng) },
        { lat: Number(dest.gcj_lat), lng: Number(dest.gcj_lng) },
      ],
      MAX_EDGE_M
    );
    for (const { lat, lng } of denseFallback) {
      const { x, z } = latLngToSceneXZ(lat, lng, ref);
      const last = legPoints[legPoints.length - 1];
      if (!last || Math.abs(last.x - x) > 1e-4 || Math.abs(last.z - z) > 1e-4) {
        legPoints.push({ x, y: 0.85, z });
      }
    }
  }
  if (legPoints.length) legPoints[0] = { x: Number(sceneX), y: 0.85, z: Number(sceneZ) };

  return {
    points: legPoints,
    distanceMeters: Math.round(legDist),
    durationSeconds: Math.round(legDur),
    segments: [
      {
        fromId: "__lbs__",
        toId: dest.id,
        fromName: "我的位置",
        toName: dest.name,
        distanceMeters: Math.round(legDist),
        durationSeconds: Math.round(legDur),
        points: legPoints,
      },
    ],
    provider: "amap",
  };
}

function straightFallback(sceneX, sceneZ, dest) {
  const ax = Number(sceneX);
  const az = Number(sceneZ);
  const bx = Number(dest.position_x);
  const bz = Number(dest.position_z);
  const legPoints = [
    { x: ax, y: 0.85, z: az },
    { x: bx, y: 0.85, z: bz },
  ];
  const dx = bx - ax;
  const dz = bz - az;
  const sceneDist = Math.sqrt(dx * dx + dz * dz);
  const legM = Math.max(20, Math.round(sceneDist * 8));
  const legS = Math.max(60, Math.round(legM * 1.1));

  return {
    points: legPoints,
    distanceMeters: legM,
    durationSeconds: legS,
    segments: [
      {
        fromId: "__lbs__",
        toId: dest.id,
        fromName: "我的位置",
        toName: dest.name,
        distanceMeters: legM,
        durationSeconds: legS,
        points: legPoints,
      },
    ],
    provider: "straight",
  };
}
