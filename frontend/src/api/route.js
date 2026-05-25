import { API_BASE } from "./base.js";

export async function planRoute(attractionIds) {
  try {
    const res = await fetch(`${API_BASE}/api/route/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attractions: attractionIds }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("planRoute failed:", e);
    return null;
  }
}

/**
 * 一键智能规划：时间轴 + LLM 理由（可选）。
 * @param {string[]} attractionIds
 * @param {{ walk?: object, lockOrder?: boolean }} [opts] walk 已请求的百度折线时可跳过服务端步行规划
 */
export async function fetchSmartPlan(attractionIds, opts = {}) {
  const body = JSON.stringify({
    attractions: attractionIds,
    lockOrder: Boolean(opts.lockOrder),
    walk: opts.walk || undefined,
  });
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };
  let res = await fetch(`${API_BASE}/api/route/smart-plan`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** 百度步行路径 → 场景折线点 */
export async function fetchBaiduWalkPolyline(attractionIds) {
  const body = JSON.stringify({ attractions: attractionIds });
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };
  let res = await fetch(`${API_BASE}/api/route/baidu-walk`, init);
  if (res.status === 404) {
    res = await fetch(`${API_BASE}/api/baidu/scene-walk-polyline`, init);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** 高德步行路径 → 场景折线点 */
export async function fetchAmapWalkPolyline(attractionIds) {
  const body = JSON.stringify({ attractions: attractionIds });
  const res = await fetch(`${API_BASE}/api/route/amap-walk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** 步行折线：先百度，失败自动改高德 */
export async function fetchWalkPolyline(attractionIds) {
  try {
    const data = await fetchBaiduWalkPolyline(attractionIds);
    return { ...data, walkProvider: "baidu" };
  } catch (bErr) {
    console.warn("[route] 百度步行失败，尝试高德:", bErr);
    const data = await fetchAmapWalkPolyline(attractionIds);
    return { ...data, walkProvider: "amap" };
  }
}
