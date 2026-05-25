/**
 * 路线点园区边界裁剪工具
 * 确保所有步行路线点保持在园区范围内
 */
// geoProject 不再用于中心计算，但保留 import 以备其他用途
// import { latLngToSceneXZ, readGeoReferenceFromDisk } from "./geoProject.js";

// 园区中心 — 基于 ground.glb 圆形地面几何中心在场景坐标系中的实际位置
// ground.glb mesh center (-0.128, -0.3865) × node scale 36.15 × root scale 3
const PARK_CENTER_X = -13.88;
const PARK_CENTER_Z = -41.92;

// 园区有效步行半径（场景单位）
// ground.glb 圆形地面实际半径: mesh radius 0.4395 × node scale 36.15 × root scale 3 ≈ 47.7
// 最远景点（翱翔）距地面中心约 42 场景单位
// 设为 47 给翱翔方向多留 1 单位余量，同时不超出绿色地面视觉边界 (47.7)
const PARK_SCENE_RADIUS = 47;

// 固定使用地面几何中心，无需通过 geo 投影计算
const _center = { x: PARK_CENTER_X, z: PARK_CENTER_Z };

/**
 * 获取园区中心场景坐标
 */
function getParkCenter() {
  return _center;
}

/**
 * 判断点是否在园区范围内
 */
function isInsidePark(x, z) {
  const c = getParkCenter();
  const dx = x - c.x;
  const dz = z - c.z;
  return dx * dx + dz * dz <= PARK_SCENE_RADIUS * PARK_SCENE_RADIUS;
}

/**
 * 将园外点投影到最近的边界上
 * @param {{x: number, y: number, z: number}} pt - 园区外的点
 * @returns {{x: number, y: number, z: number}} - 边界上最近的点
 */
function clampToBoundary(pt) {
  const c = getParkCenter();
  const dx = pt.x - c.x;
  const dz = pt.z - c.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 1e-6) return { x: c.x + PARK_SCENE_RADIUS, y: pt.y ?? 0.85, z: c.z };
  const scale = PARK_SCENE_RADIUS / dist;
  return {
    x: c.x + dx * scale,
    y: pt.y ?? 0.85,
    z: c.z + dz * scale,
  };
}

/**
 * 二分法找边界交点
 * @param {{x: number, y: number, z: number}} outside - 园区外的点
 * @param {{x: number, y: number, z: number}} inside - 园区内的点
 * @returns {{x: number, y: number, z: number}} - 边界上的点
 */
function findBoundaryPoint(outside, inside) {
  let tLow = 0; // outside 端
  let tHigh = 1; // inside 端

  for (let iter = 0; iter < 16; iter++) {
    const t = (tLow + tHigh) / 2;
    const mx = outside.x + (inside.x - outside.x) * t;
    const mz = outside.z + (inside.z - outside.z) * t;

    if (isInsidePark(mx, mz)) {
      tHigh = t;
    } else {
      tLow = t;
    }
  }

  const t = tHigh; // 取园内侧的点
  return {
    x: outside.x + (inside.x - outside.x) * t,
    y: inside.y ?? 0.85,
    z: outside.z + (inside.z - outside.z) * t,
  };
}

/**
 * 裁剪路线点数组，移除超出园区的点，在边界处插值保持连续性
 * @param {Array<{x: number, y: number, z: number}>} points - 场景坐标路线点
 * @returns {Array<{x: number, y: number, z: number}>} - 裁剪后的路线点
 */
export function clipRouteToPark(points) {
  if (!points || points.length === 0) return points;

  const result = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const curInside = isInsidePark(pt.x, pt.z);

    if (curInside) {
      // 当前点在园区内
      if (i > 0 && !isInsidePark(points[i - 1].x, points[i - 1].z)) {
        // 从园外回到园内，插值找入园边界点
        const entry = findBoundaryPoint(points[i - 1], pt);
        result.push(entry);
      }
      result.push(pt);
    } else {
      // 当前点在园区外
      if (i > 0 && isInsidePark(points[i - 1].x, points[i - 1].z)) {
        // 从园内到园外，插值找出园边界点
        const exit = findBoundaryPoint(pt, points[i - 1]);
        result.push(exit);
      }
      // 跳过园外的点
    }
  }

  // 如果裁剪后为空（所有点都在园外），将每个点钳位到边界上
  if (result.length === 0) {
    return points.map((pt) => clampToBoundary(pt));
  }
  return result;
}

/**
 * 裁剪路线结果（包含 segments），统一处理 points 和各段 segment.points
 * @param {{ points: Array, segments?: Array }} walkResult
 * @returns {{ points: Array, segments?: Array }}
 */
export function clipWalkResult(walkResult) {
  if (!walkResult) return walkResult;

  walkResult.points = clipRouteToPark(walkResult.points);

  if (Array.isArray(walkResult.segments)) {
    for (const seg of walkResult.segments) {
      if (Array.isArray(seg.points)) {
        seg.points = clipRouteToPark(seg.points);
      }
    }
  }

  return walkResult;
}

export { isInsidePark, PARK_SCENE_RADIUS };
