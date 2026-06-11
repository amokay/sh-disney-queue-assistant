/**
 * 与后端 `backend/services/geoProject.js` 相同公式（浏览器侧脚本/调试用）。
 * 配置：`/assets/data/geo_reference.json`
 */

const R = 6371000;

export function parseGeoReference(obj) {
  if (!obj || typeof obj !== "object") return null;
  const o = obj;
  if (o.anchorLatGCJ == null || o.anchorLngGCJ == null) return null;
  return {
    anchorLatGCJ: Number(o.anchorLatGCJ),
    anchorLngGCJ: Number(o.anchorLngGCJ),
    anchorSceneX: Number(o.anchorSceneX ?? 0),
    anchorSceneZ: Number(o.anchorSceneZ ?? 0),
    sceneUnitsPerMeter: Number(o.sceneUnitsPerMeter ?? 1),
    headingDeg: Number(o.headingDeg ?? 0),
    flipSceneX: Boolean(o.flipSceneX),
    flipSceneZ: Boolean(o.flipSceneZ),
  };
}

export async function fetchGeoReference() {
  try {
    const res = await fetch("/assets/data/geo_reference.json");
    if (!res.ok) return null;
    return parseGeoReference(await res.json());
  } catch {
    return null;
  }
}

export function latLngToSceneXZ(lat, lng, ref) {
  if (!ref) throw new Error("geo reference missing");
  const φ1 = (ref.anchorLatGCJ * Math.PI) / 180;
  const dφ = ((lat - ref.anchorLatGCJ) * Math.PI) / 180;
  const dλ = ((lng - ref.anchorLngGCJ) * Math.PI) / 180;
  const east = R * dλ * Math.cos(φ1);
  const north = R * dφ;
  const h = (ref.headingDeg * Math.PI) / 180;
  const supm = ref.sceneUnitsPerMeter;
  let x = ref.anchorSceneX + (east * Math.cos(h) - north * Math.sin(h)) * supm;
  let z = ref.anchorSceneZ + (east * Math.sin(h) + north * Math.cos(h)) * supm;
  if (ref.flipSceneX) x = 2 * ref.anchorSceneX - x;
  if (ref.flipSceneZ) z = 2 * ref.anchorSceneZ - z;
  return { x, z };
}

export function sceneXZToLatLng(x, z, ref) {
  if (!ref) throw new Error("geo reference missing");
  let xin = x;
  let zin = z;
  if (ref.flipSceneX) xin = 2 * ref.anchorSceneX - x;
  if (ref.flipSceneZ) zin = 2 * ref.anchorSceneZ - z;
  const supm = ref.sceneUnitsPerMeter;
  const exo = (xin - ref.anchorSceneX) / supm;
  const ezo = (zin - ref.anchorSceneZ) / supm;
  const h = (ref.headingDeg * Math.PI) / 180;
  const east = exo * Math.cos(h) + ezo * Math.sin(h);
  const north = -exo * Math.sin(h) + ezo * Math.cos(h);
  const φ1 = (ref.anchorLatGCJ * Math.PI) / 180;
  const dλ = east / (R * Math.cos(φ1));
  const dφ = north / R;
  const lat = ref.anchorLatGCJ + (dφ * 180) / Math.PI;
  const lng = ref.anchorLngGCJ + (dλ * 180) / Math.PI;
  return { lat, lng };
}
