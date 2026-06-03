/**
 * 百度地图 Web 服务 API（服务端发起，不暴露 AK 到浏览器）。
 * @see https://lbsyun.baidu.com/faq/api?title=webapi/webservice-direction/walking
 *
 * 使用 coord_type=gcj02 / ret_coordtype=gcj02，与库内景点 gcj_lat/gcj_lng（高德系 GCJ）一致，可直接进 geo 投影。
 *
 * ★ 路线缓存：每次调百度 API 的结果自动存到 route_cache.json，
 *   下次相同起终点直接读缓存，不再调 API。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, "..", "..", "frontend", "assets", "data", "route_cache.json");

/** 读取缓存文件 */
function _loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    }
  } catch { /* 文件损坏则重建 */ }
  return {};
}

/** 写入缓存文件 */
function _saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (e) {
    console.warn("[route_cache] 写入缓存失败:", e.message);
  }
}

/** 生成缓存 key：对坐标取 5 位小数，确保精度足够且不会因浮点微差 miss */
function _cacheKey(origin, dest) {
  const norm = (s) => s.split(",").map(v => Number(v).toFixed(5)).join(",");
  return `${norm(origin)}|${norm(dest)}`;
}

function requireAk() {
  const ak = process.env.BAIDU_MAP_AK || process.env.BAIDU_AK;
  if (!ak) throw new Error("缺少环境变量 BAIDU_MAP_AK（写在 backend/.env 或仓库根 .env）");
  return ak;
}

/**
 * 步行规划（带本地缓存）。起终点为 GCJ-02，**纬度,经度**。
 * 同一起终点只调一次百度 API，之后永久从缓存读取。
 * @param {string} originLatCommaLng 如 "31.14194,121.65771"
 * @param {string} destLatCommaLng
 */
export async function baiduDirectionWalkingGcj(originLatCommaLng, destLatCommaLng) {
  const key = _cacheKey(originLatCommaLng, destLatCommaLng);

  // 1. 查缓存
  const cache = _loadCache();
  if (cache[key]) {
    console.info(`[baidu] 缓存命中: ${key}`);
    return cache[key];
  }

  // 2. 缓存未命中，调百度 API
  const ak = requireAk();
  const u = new URL("https://api.map.baidu.com/direction/v2/walking");
  u.searchParams.set("origin", originLatCommaLng);
  u.searchParams.set("destination", destLatCommaLng);
  u.searchParams.set("coord_type", "gcj02");
  u.searchParams.set("ret_coordtype", "gcj02");
  u.searchParams.set("output", "json");
  u.searchParams.set("ak", ak);
  const res = await fetch(u);
  const j = await res.json();
  const st = Number(j.status);
  if (st !== 0) {
    const base = j.message || JSON.stringify(j);
    let hint = "";
    if (st === 240 || /服务被禁用|APP.*禁用/i.test(String(j.message || ""))) {
      hint =
        " — 请到百度地图开放平台：① 应用管理里确认应用为「启用」；② 开通「路线规划 / 步行」等 Web 服务；③ 本请求从 **Node 服务端** 发出，请使用 **「服务端」** 类型 AK（不要用「浏览器端」AK）；④ 配置 **IP 白名单**（公网出口 IP）；⑤ 保存后等几分钟再试。";
    }
    throw new Error(`${base} [status=${j.status}]${hint}`);
  }

  // 3. 写入缓存
  cache[key] = j;
  _saveCache(cache);
  console.info(`[baidu] 已缓存新路线: ${key}`);

  return j;
}
