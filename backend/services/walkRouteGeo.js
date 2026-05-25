/** 步行折线公共：球面距离、GCJ 上插密、「经度,纬度;…」解析（高德 polyline / 百度 path 常用） */

const EARTH_R_M = 6371000;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * 在经纬度上按边长插密（仍沿折线边，不凭空拐弯）。
 * @param {Array<{ lat: number, lng: number }>} ring
 * @param {number} maxEdgeM 单段最长米数
 */
export function densifyLatLngRing(ring, maxEdgeM) {
  if (ring.length < 2) return [...ring];
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const A = ring[i];
    const B = ring[i + 1];
    out.push(A);
    const d = haversineMeters(A.lat, A.lng, B.lat, B.lng);
    const n = Math.max(1, Math.ceil(d / maxEdgeM));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push({
        lat: A.lat + (B.lat - A.lat) * t,
        lng: A.lng + (B.lng - A.lng) * t,
      });
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

/** 解析 "lng,lat;lng,lat" */
export function parseLngLatSemicolonPolyline(s) {
  if (!s || typeof s !== "string") return [];
  const out = [];
  for (const part of s.split(";")) {
    const t = part.trim();
    if (!t) continue;
    const [lngS, latS] = t.split(",");
    const lng = Number(lngS);
    const lat = Number(latS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}
