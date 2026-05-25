import { getAttractionById } from "../models/Attraction.js";
import { readGeoReferenceFromDisk, latLngToSceneXZ, sceneXZToLatLng } from "./geoProject.js";
import { amapDirectionWalking } from "./amapWebService.js";
import { densifyLatLngRing, parseLngLatSemicolonPolyline } from "./walkRouteGeo.js";
import { clipWalkResult } from "./parkBoundaryClip.js";

const MAX_EDGE_M = 2.5;

function appendLegPoints(points3d, legPoints) {
  if (!legPoints.length) return;
  const last = points3d[points3d.length - 1];
  const first = legPoints[0];
  const startAt =
    last && Math.abs(last.x - first.x) < 1e-5 && Math.abs(last.z - first.z) < 1e-5 ? 1 : 0;
  for (let k = startAt; k < legPoints.length; k++) points3d.push(legPoints[k]);
}

function buildAmapLegPoints(steps, ref, fallbackA, fallbackB) {
  const leg = [];
  for (const step of steps) {
    const seg = parseLngLatSemicolonPolyline(step.polyline);
    const dense = densifyLatLngRing(seg, MAX_EDGE_M);
    for (const { lat, lng } of dense) {
      const { x, z } = latLngToSceneXZ(lat, lng, ref);
      const y = 0.85;
      const last = leg[leg.length - 1];
      if (last && Math.abs(last.x - x) < 1e-5 && Math.abs(last.z - z) < 1e-5) continue;
      leg.push({ x, y, z });
    }
  }
  if (leg.length === 0) {
    const denseFallback = densifyLatLngRing(
      [
        { lat: Number(fallbackA.gcj_lat), lng: Number(fallbackA.gcj_lng) },
        { lat: Number(fallbackB.gcj_lat), lng: Number(fallbackB.gcj_lng) },
      ],
      MAX_EDGE_M
    );
    for (const { lat, lng } of denseFallback) {
      const { x, z } = latLngToSceneXZ(lat, lng, ref);
      const last = leg[leg.length - 1];
      if (!last || Math.abs(last.x - x) > 1e-4 || Math.abs(last.z - z) > 1e-4) {
        leg.push({ x, y: 0.85, z });
      }
    }
  }
  return leg;
}

/**
 * @param {string[]} attractionIdsInOrder
 * @param {{ gcj_lat: number, gcj_lng: number, scene_x: number, scene_z: number } | null} [startPosition]
 */
export async function buildAmapSceneWalkDetailed(attractionIdsInOrder, startPosition = null) {
  const ref = readGeoReferenceFromDisk();
  if (!ref) throw new Error("geo_reference.json 缺失或无效");

  const ids = [...attractionIdsInOrder].filter(Boolean);
  if (ids.length < 2 && !(ids.length === 1 && startPosition)) {
    throw new Error("至少需要 2 个景点 id（或 1 个景点 + startPosition）");
  }

  const points3d = [];
  const segments = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  // 首段：startPosition → ids[0]
  if (startPosition && ids.length >= 1) {
    const b = getAttractionById(ids[0]);
    if (!b) throw new Error(`未知景点 id: ${ids[0]}`);
    if (b.gcj_lat == null || b.gcj_lng == null) {
      throw new Error(`景点缺少 gcj_lat/gcj_lng，无法请求高德步行：我的位置 → ${b.id}`);
    }
    // 解析起点 GCJ 坐标
    let sLat, sLng, sSx, sSz;
    if (startPosition.gcj_lat != null && startPosition.gcj_lng != null) {
      sLat = Number(startPosition.gcj_lat);
      sLng = Number(startPosition.gcj_lng);
    }
    if (startPosition.scene_x != null && startPosition.scene_z != null) {
      sSx = Number(startPosition.scene_x);
      sSz = Number(startPosition.scene_z);
    }
    if (sLat == null && sSx != null) {
      const ll = sceneXZToLatLng(sSx, sSz, ref);
      sLat = ll.lat; sLng = ll.lng;
    }
    if (sSx == null && sLat != null) {
      const sc = latLngToSceneXZ(sLat, sLng, ref);
      sSx = sc.x; sSz = sc.z;
    }
    // 高德用 "经度,纬度"
    const origin = `${sLng},${sLat}`;
    const dest = `${Number(b.gcj_lng)},${Number(b.gcj_lat)}`;
    const j = await amapDirectionWalking(origin, dest);
    const path = j?.route?.paths?.[0];
    if (!path) throw new Error(`高德无路径返回: 我的位置 → ${b.name}`);

    const legDist = Number(path.distance) || 0;
    const legDur = Number(path.duration) || 0;
    distanceMeters += legDist;
    durationSeconds += legDur;

    const originPt = { gcj_lat: sLat, gcj_lng: sLng };
    const steps = Array.isArray(path.steps) ? path.steps : [];
    const legPoints = buildAmapLegPoints(steps, ref, originPt, b);
    if (legPoints.length && sSx != null) {
      legPoints[0] = { x: sSx, y: 0.85, z: sSz };
    }
    appendLegPoints(points3d, legPoints);

    segments.push({
      fromId: "__lbs__",
      toId: b.id,
      fromName: "我的位置",
      toName: b.name,
      distanceMeters: Math.round(legDist),
      durationSeconds: Math.round(legDur),
      points: legPoints,
    });
  }

  for (let i = 0; i < ids.length - 1; i++) {
    const a = getAttractionById(ids[i]);
    const b = getAttractionById(ids[i + 1]);
    if (!a || !b) throw new Error(`未知景点 id: ${ids[i]} 或 ${ids[i + 1]}`);
    if (a.gcj_lat == null || a.gcj_lng == null || b.gcj_lat == null || b.gcj_lng == null) {
      throw new Error(`景点缺少 gcj_lat/gcj_lng，无法请求高德步行：${a.id} → ${b.id}`);
    }

    const origin = `${Number(a.gcj_lng)},${Number(a.gcj_lat)}`;
    const dest = `${Number(b.gcj_lng)},${Number(b.gcj_lat)}`;
    const j = await amapDirectionWalking(origin, dest);
    const path = j?.route?.paths?.[0];
    if (!path) throw new Error(`高德无路径返回: ${a.name} → ${b.name}`);

    const legDist = Number(path.distance) || 0;
    const legDur = Number(path.duration) || 0;
    distanceMeters += legDist;
    durationSeconds += legDur;

    const steps = Array.isArray(path.steps) ? path.steps : [];
    const legPoints = buildAmapLegPoints(steps, ref, a, b);
    appendLegPoints(points3d, legPoints);

    segments.push({
      fromId: a.id,
      toId: b.id,
      fromName: a.name,
      toName: b.name,
      distanceMeters: Math.round(legDist),
      durationSeconds: Math.round(legDur),
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

/**
 * @param {string[]} attractionIdsInOrder
 */
export async function buildSceneWalkPolyline(attractionIdsInOrder) {
  const full = await buildAmapSceneWalkDetailed(attractionIdsInOrder);
  return clipWalkResult({
    points: full.points,
    distanceMeters: full.distanceMeters,
    durationSeconds: full.durationSeconds,
    segments: full.segments,
    provider: "amap",
  });
}
