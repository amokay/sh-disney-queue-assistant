import { CASTLE_GEO } from "./geoLocation.js";

/** 上海迪士尼乐园核心区近似中心（GCJ-02） */
export const PARK_CENTER = {
  lat: CASTLE_GEO.gcj_lat,
  lng: CASTLE_GEO.gcj_lng,
};

/** 判定「在园内」半径（米）；略放宽以覆盖停车场/小镇 */
export const IN_PARK_RADIUS_M = 3200;

const R = 6371000;

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isInsideDisneyPark(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return false;
  }
  return distanceMeters(lat, lng, PARK_CENTER.lat, PARK_CENTER.lng) <= IN_PARK_RADIUS_M;
}

/**
 * 根据一次 GPS 判断行前 / 行中（失败则默认行前，可手动改）
 * @returns {Promise<{ mode: 'pretrip'|'inpark', source: string, label: string, lat?: number, lng?: number }>}
 */
export function detectVisitContext() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({
        mode: "pretrip",
        source: "unsupported",
        label: "浏览器不支持定位，按行前规划",
      });
      return;
    }

    const timer = setTimeout(() => {
      resolve({
        mode: "pretrip",
        source: "timeout",
        label: "定位超时，默认行前规划",
      });
    }, 9000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const inPark = isInsideDisneyPark(lat, lng);
        resolve({
          mode: inPark ? "inpark" : "pretrip",
          source: "gps",
          lat,
          lng,
          label: inPark
            ? "定位在乐园附近，已切换行中模式"
            : "当前不在园内，按行前规划",
        });
      },
      () => {
        clearTimeout(timer);
        resolve({
          mode: "pretrip",
          source: "denied",
          label: "未授权定位，默认行前规划（可手动改）",
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );
  });
}
