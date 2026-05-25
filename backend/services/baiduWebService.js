/**
 * 百度地图 Web 服务 API（服务端发起，不暴露 AK 到浏览器）。
 * @see https://lbsyun.baidu.com/faq/api?title=webapi/webservice-direction/walking
 *
 * 使用 coord_type=gcj02 / ret_coordtype=gcj02，与库内景点 gcj_lat/gcj_lng（高德系 GCJ）一致，可直接进 geo 投影。
 */

function requireAk() {
  const ak = process.env.BAIDU_MAP_AK || process.env.BAIDU_AK;
  if (!ak) throw new Error("缺少环境变量 BAIDU_MAP_AK（写在 backend/.env 或仓库根 .env）");
  return ak;
}

/**
 * 步行规划。起终点为 GCJ-02，**纬度,经度**（与百度文档一致；与高德「经度,纬度」字符串顺序不同）。
 * @param {string} originLatCommaLng 如 "31.14194,121.65771"
 * @param {string} destLatCommaLng
 */
export async function baiduDirectionWalkingGcj(originLatCommaLng, destLatCommaLng) {
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
  return j;
}
