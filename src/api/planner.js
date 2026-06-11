import { API_BASE } from "./base.js";
import { findWalkRoute } from "../pathfinder.js";

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchAttractionsMetadata() {
  const res = await fetch(`${API_BASE}/api/planner/attractions/metadata`);
  const data = await parseJson(res);
  return data.attractions || [];
}

export async function postPretripPlan(body) {
  const res = await fetch(`${API_BASE}/api/planner/pretrip-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchNextRecommendation(sessionId) {
  const res = await fetch(
    `${API_BASE}/api/planner/next-recommendation?sessionId=${encodeURIComponent(sessionId)}`
  );
  return parseJson(res);
}

/** Step2：完整行中状态（下一站 + 机会项 + 到访状态 + 定位） */
export async function fetchCurrentState(sessionId) {
  const res = await fetch(
    `${API_BASE}/api/planner/current-state?sessionId=${encodeURIComponent(sessionId)}`
  );
  return parseJson(res);
}

export async function postAdoptOpportunity(sessionId, attractionId) {
  const res = await fetch(`${API_BASE}/api/planner/adopt-opportunity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, attractionId }),
  });
  return parseJson(res);
}

export async function postReplan(sessionId) {
  const res = await fetch(`${API_BASE}/api/planner/replan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return parseJson(res);
}

export async function fetchMockScenarios() {
  const res = await fetch(`${API_BASE}/api/planner/mock-scenarios`);
  return parseJson(res);
}

export async function applyMockScenario(scenario) {
  const res = await fetch(`${API_BASE}/api/planner/mock-scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  return parseJson(res);
}

/** 我的位置（场景 xz）→ 下一站 步行路线 */
export async function fetchWalkToNext(scene_x, scene_z, attractionId) {
  try {
    const res = await fetch(`${API_BASE}/api/planner/walk-to-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_x, scene_z, attractionId }),
    });
    return await parseJson(res);
  } catch (e) {
    console.warn("[walkToNext] API failed, using client-side park-road pathfinder:", e.message);
    // 静态部署兜底：加载景点坐标 + park_roads 路网客户端寻路
    try {
      const attrRes = await fetch("./assets/data/attractions_static.json");
      if (!attrRes.ok) throw new Error("no static data");
      const attrs = await attrRes.json();
      const target = attrs.find(a => a.id === attractionId);
      if (!target) throw new Error("attraction not found");
      const tx = target.position_x, tz = target.position_z;
      const route = await findWalkRoute(scene_x, scene_z, tx, tz);
      if (route && route.points && route.points.length >= 2) return route;
      throw new Error("pathfinder returned no route");
    } catch (e2) {
      console.error("[walkToNext] client pathfinder also failed:", e2.message);
      throw e;
    }
  }
}
