/**
 * 高德 Web 服务 v3：关键字搜索、周边搜索（GCJ-02）。
 * @see https://lbs.amap.com/api/webservice/guide/api/search
 */

const AMAP_TEXT = "https://restapi.amap.com/v3/place/text";
const AMAP_AROUND = "https://restapi.amap.com/v3/place/around";

/** @param {string | undefined} key */
export function requireAmapWebKey(key) {
  const resolved = key || process.env.AMAP_WEB_KEY || process.env.AMAP_KEY;
  if (!resolved) throw new Error("请设置环境变量 AMAP_WEB_KEY（高德 Web 服务 Key）");
  return resolved;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ amapId: string, name: string, type: string, typecode: string, address: string, tel: string, lat: number, lng: number } | null}
 */
export function normalizePlacePoi(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = /** @type {Record<string, unknown>} */ (raw);
  const id = p.id != null ? String(p.id).trim() : "";
  const loc = p.location != null ? String(p.location) : "";
  const parts = loc.split(",");
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    amapId: id,
    name: String(p.name || "").trim() || id,
    type: String(p.type || "").trim(),
    typecode: String(p.typecode || "").trim(),
    address: String(p.address || "").trim(),
    tel: String(p.tel || "").trim(),
    lat,
    lng,
  };
}

/**
 * @param {unknown} j
 * @returns {{ ok: boolean, info?: string, pois: ReturnType<typeof normalizePlacePoi>[], total: number }}
 */
function parsePlaceResponse(j) {
  if (!j || typeof j !== "object") return { ok: false, info: "invalid json", pois: [], total: 0 };
  const o = /** @type {Record<string, unknown>} */ (j);
  if (String(o.status) !== "1") {
    return { ok: false, info: String(o.info || o.infocode || "amap error"), pois: [], total: 0 };
  }
  const list = Array.isArray(o.pois) ? o.pois : [];
  const pois = [];
  for (const item of list) {
    const n = normalizePlacePoi(item);
    if (n) pois.push(n);
  }
  const total = Math.max(0, parseInt(String(o.count ?? "0"), 10) || 0);
  return { ok: true, pois, total };
}

/**
 * @param {{
 *   key?: string,
 *   keywords: string,
 *   city?: string,
 *   page?: number,
 *   offset?: number,
 * }} opts
 */
export async function amapPlaceTextPage(opts) {
  const key = requireAmapWebKey(opts.key);
  const u = new URL(AMAP_TEXT);
  u.searchParams.set("keywords", opts.keywords);
  u.searchParams.set("city", opts.city || process.env.AMAP_CITY || "上海");
  u.searchParams.set("output", "json");
  u.searchParams.set("offset", String(Math.min(25, Math.max(1, opts.offset ?? 25))));
  u.searchParams.set("page", String(Math.max(1, opts.page ?? 1)));
  u.searchParams.set("key", key);
  const res = await fetch(u);
  const j = await res.json();
  return parsePlaceResponse(j);
}

/**
 * @param {{
 *   key?: string,
 *   location: string,
 *   radius: number,
 *   keywords?: string,
 *   types?: string,
 *   city?: string,
 *   page?: number,
 *   offset?: number,
 * }} opts
 */
export async function amapPlaceAroundPage(opts) {
  const key = requireAmapWebKey(opts.key);
  const u = new URL(AMAP_AROUND);
  u.searchParams.set("location", opts.location);
  u.searchParams.set("radius", String(Math.min(50000, Math.max(1, opts.radius))));
  if (opts.keywords) u.searchParams.set("keywords", opts.keywords);
  if (opts.types) u.searchParams.set("types", opts.types);
  if (opts.city) u.searchParams.set("city", opts.city);
  u.searchParams.set("output", "json");
  u.searchParams.set("offset", String(Math.min(25, Math.max(1, opts.offset ?? 25))));
  u.searchParams.set("page", String(Math.max(1, opts.page ?? 1)));
  u.searchParams.set("key", key);
  const res = await fetch(u);
  const j = await res.json();
  return parsePlaceResponse(j);
}
