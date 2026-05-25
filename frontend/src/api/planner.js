import { API_BASE } from "./base.js";

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
  const res = await fetch(`${API_BASE}/api/planner/walk-to-next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene_x, scene_z, attractionId }),
  });
  return parseJson(res);
}
