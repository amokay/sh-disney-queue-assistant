/**
 * 高德 Web 服务（REST），无需在页面嵌入地图。
 * @see https://lbs.amap.com/api/webservice/guide/api/direction
 */

function requireKey() {
  const key = process.env.AMAP_WEB_KEY || process.env.AMAP_KEY;
  if (!key) throw new Error("缺少环境变量 AMAP_WEB_KEY（写在 backend/.env 或仓库根 .env）");
  return key;
}

/**
 * 步行路径规划（GCJ-02，origin/destination 均为 "经度,纬度"）
 * @param {string} originLngLat 如 "121.657,31.142"
 * @param {string} destLngLat
 */
export async function amapDirectionWalking(originLngLat, destLngLat) {
  const key = requireKey();
  const u = new URL("https://restapi.amap.com/v3/direction/walking");
  u.searchParams.set("key", key);
  u.searchParams.set("origin", originLngLat);
  u.searchParams.set("destination", destLngLat);
  u.searchParams.set("output", "json");
  const res = await fetch(u);
  const j = await res.json();
  if (String(j.status) !== "1") {
    throw new Error(j.info || j.infocode || JSON.stringify(j));
  }
  return j;
}

/**
 * 驾车路径（经度,纬度）
 */
export async function amapDirectionDriving(originLngLat, destLngLat) {
  const key = requireKey();
  const u = new URL("https://restapi.amap.com/v3/direction/driving");
  u.searchParams.set("key", key);
  u.searchParams.set("origin", originLngLat);
  u.searchParams.set("destination", destLngLat);
  u.searchParams.set("output", "json");
  const res = await fetch(u);
  const j = await res.json();
  if (String(j.status) !== "1") {
    throw new Error(j.info || j.infocode || JSON.stringify(j));
  }
  return j;
}
