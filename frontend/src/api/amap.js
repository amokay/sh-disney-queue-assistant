import { API_BASE } from "./base.js";

/**
 * 高德步行路径（经后端转发，不暴露 Key）。origin/destination 为 GCJ-02「经度,纬度」。
 * @param {string} originLngLat 如 "121.65771,31.14194"
 * @param {string} destLngLat
 */
export async function fetchAmapWalkingRoute(originLngLat, destLngLat) {
  const q = new URLSearchParams({ origin: originLngLat, destination: destLngLat });
  const res = await fetch(`${API_BASE}/api/amap/direction/walking?${q}`);
  if (!res.ok) throw new Error(`walking ${res.status}`);
  return await res.json();
}

/** 驾车路径，参数同上 */
export async function fetchAmapDrivingRoute(originLngLat, destLngLat) {
  const q = new URLSearchParams({ origin: originLngLat, destination: destLngLat });
  const res = await fetch(`${API_BASE}/api/amap/direction/driving?${q}`);
  if (!res.ok) throw new Error(`driving ${res.status}`);
  return await res.json();
}
