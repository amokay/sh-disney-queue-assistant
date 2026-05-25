import { getAttractionById } from "../models/Attraction.js";
import { getLatestWaitTimes } from "../models/WaitTime.js";

function dist3(a, b) {
  const dx = a.position_x - b.position_x;
  const dy = a.position_y - b.position_y;
  const dz = a.position_z - b.position_z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 贪心：从园区入口近似点 (0,0,0) 出发，每次选离当前位置最近的未访问景点。
 * 步行时间 = 欧氏距离 * 0.5 分钟/单位。
 */
export function planRoute(attractionIds) {
  const ids = [...new Set(attractionIds)].filter(Boolean);
  if (ids.length === 0) {
    return { ordered: [], totalMinutes: 0, walkMinutes: 0, waitMinutes: 0 };
  }

  const attractions = ids
    .map((id) => getAttractionById(id))
    .filter(Boolean);
  if (attractions.length === 0) {
    return { ordered: [], totalMinutes: 0, walkMinutes: 0, waitMinutes: 0 };
  }

  const waitRows = getLatestWaitTimes();
  const waitMap = new Map(waitRows.map((w) => [w.attraction_id, w.wait_minutes]));

  let current = { position_x: 0, position_y: 0, position_z: 0 };
  const remaining = [...attractions];
  const ordered = [];

  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist3(current, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }

  let walkMinutes = 0;
  let prev = { position_x: 0, position_y: 0, position_z: 0 };
  for (const a of ordered) {
    walkMinutes += dist3(prev, a) * 0.5;
    prev = a;
  }

  let waitMinutes = 0;
  const enriched = ordered.map((a) => {
    const w = waitMap.get(a.id);
    const wm = typeof w === "number" ? w : 20;
    waitMinutes += wm;
    return {
      id: a.id,
      name: a.name,
      zone: a.zone,
      position: { x: a.position_x, y: a.position_y, z: a.position_z },
      waitMinutes: wm,
    };
  });

  const totalMinutes = Math.round(waitMinutes + walkMinutes);

  return {
    ordered: enriched,
    totalMinutes,
    walkMinutes: Math.round(walkMinutes * 10) / 10,
    waitMinutes: Math.round(waitMinutes),
  };
}
