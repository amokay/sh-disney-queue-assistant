import { getAttractionById } from "../models/Attraction.js";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "./geoProject.js";
import { baiduDirectionWalkingGcj } from "./baiduWebService.js";
import { densifyLatLngRing, parseLngLatSemicolonPolyline } from "./walkRouteGeo.js";
import { clipWalkResult } from "./parkBoundaryClip.js";

function stepToLngLatRing(step) {
  const seg = parseLngLatSemicolonPolyline(step?.path);
  if (seg.length >= 2) return seg;
  const o = step?.stepOriginLocation ?? step?.step_origin_location;
  const d = step?.stepDestinationLocation ?? step?.step_destination_location;
  if (o && d && o.lat != null && o.lng != null && d.lat != null && d.lng != null) {
    return [
      { lat: Number(o.lat), lng: Number(o.lng) },
      { lat: Number(d.lat), lng: Number(d.lng) },
    ];
  }
  return seg;
}

export function buildLegPoints(steps, ref, maxEdgeM, fallbackA, fallbackB) {
  const leg = [];
  for (const step of steps) {
    const ring = stepToLngLatRing(step);
    const dense = densifyLatLngRing(ring, maxEdgeM);
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
      maxEdgeM
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
 */
export async function buildBaiduSceneWalkPolyline(attractionIdsInOrder) {
  const full = await buildBaiduSceneWalkDetailed(attractionIdsInOrder);
  return clipWalkResult({
    points: full.points,
    distanceMeters: full.distanceMeters,
    durationSeconds: full.durationSeconds,
    segments: full.segments,
    provider: "baidu",
  });
}

/**
 * @param {string[]} attractionIdsInOrder
 * @param {{ gcj_lat: number, gcj_lng: number, scene_x: number, scene_z: number } | null} [startPosition]
 */
export async function buildBaiduSceneWalkDetailed(attractionIdsInOrder, startPosition = null) {
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
  const maxEdgeM = 2.5;

  // 首段：startPosition → ids[0]
  const startIdx = startPosition ? 0 : 1;
  if (startPosition && ids.length >= 1) {
    const b = getAttractionById(ids[0]);
    if (!b) throw new Error(`未知景点 id: ${ids[0]}`);
    if (b.gcj_lat == null || b.gcj_lng == null) {
      throw new Error(`景点缺少 gcj_lat/gcj_lng，无法请求百度步行：我的位置 → ${b.id}`);
    }
    const origin = `${Number(startPosition.gcj_lat)},${Number(startPosition.gcj_lng)}`;
    const dest = `${Number(b.gcj_lat)},${Number(b.gcj_lng)}`;
    const j = await baiduDirectionWalkingGcj(origin, dest);
    const routes = j?.result?.routes;
    const route0 = Array.isArray(routes) ? routes[0] : null;
    if (!route0) throw new Error(`百度无路径返回: 我的位置 → ${b.name}`);

    const legDist = Number(route0.distance) || 0;
    const legDur = Number(route0.duration) || 0;
    distanceMeters += legDist;
    durationSeconds += legDur;

    const originPt = { gcj_lat: startPosition.gcj_lat, gcj_lng: startPosition.gcj_lng };
    const steps = Array.isArray(route0.steps) ? route0.steps : [];
    const legPoints = buildLegPoints(steps, ref, maxEdgeM, originPt, b);
    // 确保首点用精确 scene 坐标
    if (legPoints.length) {
      legPoints[0] = { x: Number(startPosition.scene_x), y: 0.85, z: Number(startPosition.scene_z) };
    }
    points3d.push(...legPoints);

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

  for (let i = startIdx; i < ids.length - 1; i++) {
    const a = getAttractionById(ids[i]);
    const b = getAttractionById(ids[i + 1]);
    if (!a || !b) throw new Error(`未知景点 id: ${ids[i]} 或 ${ids[i + 1]}`);
    if (a.gcj_lat == null || a.gcj_lng == null || b.gcj_lat == null || b.gcj_lng == null) {
      throw new Error(`景点缺少 gcj_lat/gcj_lng，无法请求百度步行：${a.id} → ${b.id}`);
    }

    const origin = `${Number(a.gcj_lat)},${Number(a.gcj_lng)}`;
    const dest = `${Number(b.gcj_lat)},${Number(b.gcj_lng)}`;
    const j = await baiduDirectionWalkingGcj(origin, dest);
    const routes = j?.result?.routes;
    const route0 = Array.isArray(routes) ? routes[0] : null;
    if (!route0) throw new Error(`百度无路径返回: ${a.name} → ${b.name}`);

    const legDist = Number(route0.distance) || 0;
    const legDur = Number(route0.duration) || 0;
    distanceMeters += legDist;
    durationSeconds += legDur;

    const steps = Array.isArray(route0.steps) ? route0.steps : [];
    const legPoints = buildLegPoints(steps, ref, maxEdgeM, a, b);
    if (legPoints.length) {
      const last = points3d[points3d.length - 1];
      const first = legPoints[0];
      const startAt =
        last && Math.abs(last.x - first.x) < 1e-5 && Math.abs(last.z - first.z) < 1e-5 ? 1 : 0;
      for (let k = startAt; k < legPoints.length; k++) points3d.push(legPoints[k]);
    }

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
