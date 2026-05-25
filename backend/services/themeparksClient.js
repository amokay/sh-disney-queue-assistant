import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mappingPath = path.join(__dirname, "..", "config", "themeparks-mapping.json");

let mapping = null;
function getMapping() {
  if (!mapping) {
    mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  }
  return mapping;
}

/**
 * 从 themeparks.wiki API 获取上海迪士尼实时排队数据
 * @returns {Promise<Array<{attractionId: string, waitMinutes: number|null, status: string}>>}
 */
export async function fetchLiveWaitTimes() {
  const { park_id, api_base, attractions } = getMapping();
  const url = `${api_base}/entity/${park_id}/live`;

  const res = await fetch(url, {
    headers: { "User-Agent": "shanghai-disney-twin/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`themeparks API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const liveData = data.liveData || [];

  // 反转映射：themeparks ID → 项目 ID
  const reverseMap = {};
  for (const [projectId, themeparksId] of Object.entries(attractions)) {
    reverseMap[themeparksId] = projectId;
  }

  const results = [];
  for (const item of liveData) {
    const projectId = reverseMap[item.id];
    if (!projectId) continue; // 未映射的景点跳过

    const isOperating = item.status === "OPERATING";
    const waitMinutes = item.queue?.STANDBY?.waitTime ?? null;

    results.push({
      attractionId: projectId,
      waitMinutes: isOperating ? (waitMinutes ?? 0) : null,
      status: isOperating ? "ok" : "closed",
    });
  }

  return results;
}
