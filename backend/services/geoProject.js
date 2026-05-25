import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const R = 6371000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 默认读项目内前端静态配置（与前端 fetch 的 JSON 同源） */
export function defaultGeoReferencePath() {
  return path.join(__dirname, "..", "..", "frontend", "assets", "data", "geo_reference.json");
}

/**
 * @param {unknown} obj
 * @returns {null | {
 *   anchorLatGCJ: number, anchorLngGCJ: number, anchorSceneX: number, anchorSceneZ: number,
 *   sceneUnitsPerMeter: number, headingDeg: number,
 *   flipSceneX?: boolean, flipSceneZ?: boolean
 * }}
 */
export function parseGeoReference(obj) {
  if (!obj || typeof obj !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (obj);
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

export function readGeoReferenceFromDisk(filePath = defaultGeoReferencePath()) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parseGeoReference(j);
  } catch {
    return null;
  }
}

/**
 * 高德 GCJ-02 经纬度 → 场景水平坐标（y 仍用数据库里的高度或 0）
 * 使用锚点处局部平面近似（乐园尺度足够准）。
 */
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

/** 场景 xz → GCJ-02（与 latLngToSceneXZ 互逆，局部平面近似） */
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
