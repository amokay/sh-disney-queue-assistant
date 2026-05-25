import { sceneDistance } from "./costModel.js";
import { getPlannerStep2Config } from "./plannerConfig.js";
import { getAttractionById } from "../models/Attraction.js";

/**
 * @param {{ position_x: number, position_z: number }} userPos scene coords (y ignored)
 * @param {string | null} targetAttractionId
 * @param {string | null} nextRecommendationId
 */
export function inferVisitState(userPos, targetAttractionId, nextRecommendationId) {
  const cfg = getPlannerStep2Config().location;
  const arrivedR = cfg.arrivedRadiusScene ?? 6;
  const headingR = cfg.headingRadiusScene ?? 25;

  if (!userPos || userPos.position_x == null) {
    return {
      status: "unknown",
      label: "未获取定位",
      targetAttractionId: nextRecommendationId || targetAttractionId,
    };
  }

  const targetId = nextRecommendationId || targetAttractionId;
  if (!targetId) {
    return { status: "idle", label: "暂无目标项目", targetAttractionId: null };
  }

  const target = getAttractionById(targetId);
  if (!target) {
    return { status: "unknown", label: "目标项目无效", targetAttractionId: targetId };
  }

  const dist = sceneDistance(userPos, target);

  if (dist <= arrivedR) {
    return {
      status: "arrived",
      label: `已到达「${target.name}」附近`,
      distanceScene: Math.round(dist * 10) / 10,
      targetAttractionId: targetId,
      targetName: target.name,
    };
  }

  if (dist <= headingR) {
    return {
      status: "approaching",
      label: `正在前往「${target.name}」`,
      distanceScene: Math.round(dist * 10) / 10,
      targetAttractionId: targetId,
      targetName: target.name,
    };
  }

  return {
    status: "heading",
    label: `前往「${target.name}」（约 ${Math.round(dist)} 场景单位）`,
    distanceScene: Math.round(dist * 10) / 10,
    targetAttractionId: targetId,
    targetName: target.name,
  };
}

/**
 * 是否明显靠近了非推荐项目（用户偏航提示）
 */
export function detectOffRouteAttraction(userPos, nextId, attractions, doneIds) {
  if (!userPos || !nextId) return null;
  const next = getAttractionById(nextId);
  if (!next) return null;

  let nearest = null;
  let nearestDist = Infinity;
  for (const a of attractions) {
    if (a.id === nextId || doneIds.has(a.id) || a.is_open === 0) continue;
    const d = sceneDistance(userPos, a);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = a;
    }
  }
  const distToNext = sceneDistance(userPos, next);
  const cfg = getPlannerStep2Config().location;
  if (nearest && nearestDist < (cfg.arrivedRadiusScene ?? 6) && nearestDist < distToNext * 0.65) {
    return { id: nearest.id, name: nearest.name, distanceScene: nearestDist };
  }
  return null;
}
