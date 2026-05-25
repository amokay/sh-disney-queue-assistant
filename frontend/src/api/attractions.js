import { API_BASE } from "./base.js";

async function safeJson(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchAttractions() {
  try {
    const res = await fetch(`${API_BASE}/api/attractions`);
    const data = await safeJson(res);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("fetchAttractions failed:", e);
    return [];
  }
}

export async function fetchWaitTimes() {
  try {
    const res = await fetch(`${API_BASE}/api/waittimes`);
    const data = await safeJson(res);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("fetchWaitTimes failed:", e);
    return [];
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
