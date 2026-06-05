import { API_BASE, IS_STATIC_DEPLOY } from "./base.js";

async function safeJson(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/** 静态数据兜底：当后端 API 不可用时（如 .io 静态部署），加载本地 JSON */
async function fallbackJson(path) {
  try {
    // 添加时间戳避免 CDN/浏览器缓存返回旧文件
    const url = path + (path.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[fallbackJson]", path, "returned", res.status);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[fallbackJson]", path, "error:", e.message);
    return [];
  }
}

export async function fetchAttractions() {
  if (IS_STATIC_DEPLOY) return fallbackJson("./assets/data/attractions_static.json");
  try {
    const res = await fetch(`${API_BASE}/api/attractions`);
    const data = await safeJson(res);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("fetchAttractions API failed, trying static fallback:", e.message);
    return fallbackJson("./assets/data/attractions_static.json");
  }
}

export async function fetchWaitTimes() {
  if (IS_STATIC_DEPLOY) return fallbackJson("./assets/data/waittimes_static.json");
  try {
    const res = await fetch(`${API_BASE}/api/waittimes`);
    const data = await safeJson(res);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("fetchWaitTimes API failed, trying static fallback:", e.message);
    return fallbackJson("./assets/data/waittimes_static.json");
  }
}

/** 场景 xz → 高德 GCJ-02（与后端 geo_reference.json 一致，用于核对是否「对上高德」） */
export async function fetchGeoInverse(x, z) {
  const q = new URLSearchParams({ x: String(x), z: String(z) });
  const res = await fetch(`${API_BASE}/api/geo/inverse?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `geo inverse ${res.status}`);
  return data;
}

/** 高德 GCJ-02 → 场景 xz（需后端与 geo_reference.json） */
export async function fetchGeoProject(lat, lng) {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`${API_BASE}/api/geo/project?${q}`);
  if (!res.ok) throw new Error(`geo project ${res.status}`);
  return await res.json();
}
