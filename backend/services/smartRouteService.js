import { planRoute } from "./routeService.js";
import { getAttractionById } from "../models/Attraction.js";
import { getLatestWaitTimes } from "../models/WaitTime.js";
import { buildSceneWalkDetailed } from "./sceneWalkRoute.js";
import { chatJson, hasLlmConfigured } from "./llmClient.js";

function enrichOrderedAttractions(rows) {
  const waitRows = getLatestWaitTimes();
  const waitMap = new Map(waitRows.map((w) => [w.attraction_id, w.wait_minutes]));
  return rows.map((a) => {
    const w = waitMap.get(a.id);
    const wm = typeof w === "number" ? w : 20;
    return {
      id: a.id,
      name: a.name,
      zone: a.zone,
      position: { x: a.position_x, y: a.position_y, z: a.position_z },
      waitMinutes: wm,
    };
  });
}

const DEFAULT_PLAY_MINUTES = 25;
const PARK_OPEN_MINUTES = 9 * 60;

function formatClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function defaultRationale(ordered, totalWait, totalWalk, totalPlay) {
  const names = ordered.map((o) => o.name).join(" → ");
  return [
    `按当前排队与步行距离，建议顺序为：${names}，总步行约 ${totalWalk} 分钟。`,
    `预计排队合计 ${totalWait} 分钟、游玩约 ${totalPlay} 分钟，优先把等待较久的项目安排在路线前段以节省时间。`,
  ];
}

/**
 * @param {string[]} attractionIds
 * @param {{ walk?: { points?: unknown[], segments?: unknown[], distanceMeters?: number, durationSeconds?: number }, lockOrder?: boolean, startPosition?: { gcj_lat: number, gcj_lng: number, scene_x: number, scene_z: number } | null }} [opts]
 *   walk — 前端已请求的步行折线，服务端不再调百度
 *   lockOrder — 保持 attractions 数组顺序（与 walk 一致），LLM 仅生成文案不重排
 *   startPosition — 路线首段起点（当前 LBS），存在时首段为“我的位置 → ids[0]”
 */
export async function buildSmartItinerary(attractionIds, opts = {}) {
  const ids = [...new Set(attractionIds)].filter(Boolean);
  if (ids.length < 1) throw new Error("至少需要 1 个景点");

  const lockOrder = Boolean(opts.lockOrder);
  const preWalk = opts.walk;
  const startPosition = opts.startPosition || null;

  let ordered;
  if (lockOrder) {
    const rows = ids.map((id) => getAttractionById(id)).filter(Boolean);
    if (rows.length !== ids.length) throw new Error("部分景点 id 无效");
    ordered = enrichOrderedAttractions(rows);
  } else {
    ordered = planRoute(ids).ordered;
  }

  let rationale = null;
  let llmUsed = false;
  const playById = Object.create(null);

  if (ids.length >= 2 && hasLlmConfigured() && !lockOrder) {
    try {
      const ctx = {
        attractions: ordered.map((a) => ({
          id: a.id,
          name: a.name,
          zone: a.zone,
          waitMinutes: a.waitMinutes,
          suggestedPlayMinutes: DEFAULT_PLAY_MINUTES,
        })),
        hint: "可调整访问顺序以平衡排队与步行。返回 JSON：{ orderedIds: string[], rationale: [string,string], playMinutesById?: Record<string,number> }",
      };
      const system =
        "你是上海迪士尼乐园行程规划助手。根据排队时长、区域与步行成本给出游览顺序与两行简短理由。只输出合法 JSON，不要 markdown。";
      const out = await chatJson(system, JSON.stringify(ctx));
      if (out?.orderedIds && Array.isArray(out.orderedIds) && out.orderedIds.length === ordered.length) {
        const byId = new Map(ordered.map((a) => [a.id, a]));
        const reordered = out.orderedIds.map((id) => byId.get(id)).filter(Boolean);
        if (reordered.length === ordered.length) ordered = reordered;
      }
      if (out?.playMinutesById && typeof out.playMinutesById === "object") {
        for (const [k, v] of Object.entries(out.playMinutesById)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) playById[k] = n;
        }
      }
      if (Array.isArray(out?.rationale) && out.rationale.length >= 2) {
        rationale = [String(out.rationale[0]), String(out.rationale[1])];
        llmUsed = true;
      }
    } catch (e) {
      console.warn("[smart-route] LLM 跳过:", e?.message || e);
    }
  } else if (ids.length >= 2 && hasLlmConfigured() && lockOrder) {
    try {
      const ctx = {
        attractions: ordered.map((a) => ({
          id: a.id,
          name: a.name,
          zone: a.zone,
          waitMinutes: a.waitMinutes,
        })),
        hint: "顺序已固定。只输出 JSON：{ rationale: [string,string] }，不要 orderedIds。",
      };
      const system =
        "你是上海迪士尼乐园行程规划助手。根据下列固定顺序写两行简短游览理由。只输出合法 JSON，不要 markdown。";
      const out = await chatJson(system, JSON.stringify(ctx));
      if (Array.isArray(out?.rationale) && out.rationale.length >= 2) {
        rationale = [String(out.rationale[0]), String(out.rationale[1])];
        llmUsed = true;
      }
    } catch (e) {
      console.warn("[smart-route] LLM 文案跳过:", e?.message || e);
    }
  }

  const orderedIds = ordered.map((a) => a.id);
  let walk = { points: [], distanceMeters: 0, durationSeconds: 0, segments: [] };
  let walkProvider = "none";
  if (preWalk?.points?.length) {
    walk = {
      points: preWalk.points,
      segments: Array.isArray(preWalk.segments) ? preWalk.segments : [],
      distanceMeters: Number(preWalk.distanceMeters) || 0,
      durationSeconds: Number(preWalk.durationSeconds) || 0,
    };
    walkProvider = "client";
  } else if (orderedIds.length >= 2 || (orderedIds.length >= 1 && startPosition)) {
    const detailed = await buildSceneWalkDetailed(orderedIds, startPosition);
    walk = {
      points: detailed.points,
      segments: detailed.segments,
      distanceMeters: detailed.distanceMeters,
      durationSeconds: detailed.durationSeconds,
    };
    walkProvider = detailed.provider || "unknown";
  }

  let cursor = PARK_OPEN_MINUTES;
  const timeline = [];
  let totalWait = 0;
  let totalWalk = 0;
  let totalPlay = 0;

  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i];
    const seg = walk.segments[i - 1];
    if (seg) {
      const walkMin = Math.max(1, Math.round(seg.durationSeconds / 60));
      timeline.push({
        kind: "walk",
        fromId: seg.fromId,
        toId: seg.toId,
        fromName: seg.fromName,
        toName: seg.toName,
        distanceMeters: seg.distanceMeters,
        durationMinutes: walkMin,
        startLabel: formatClock(cursor),
        endLabel: formatClock(cursor + walkMin),
      });
      cursor += walkMin;
      totalWalk += walkMin;
    }

    const waitMin = Math.max(0, Number(a.waitMinutes) || 0);
    const playMin = Number(playById[a.id]) || DEFAULT_PLAY_MINUTES;
    const arrive = formatClock(cursor);
    const afterWait = cursor + waitMin;
    const leave = afterWait + playMin;

    timeline.push({
      kind: "visit",
      id: a.id,
      name: a.name,
      zone: a.zone,
      order: i + 1,
      waitMinutes: waitMin,
      playMinutes: playMin,
      arriveLabel: arrive,
      waitEndLabel: formatClock(afterWait),
      leaveLabel: formatClock(leave),
    });

    cursor = leave;
    totalWait += waitMin;
    totalPlay += playMin;
  }

  if (!rationale) {
    rationale = defaultRationale(ordered, totalWait, totalWalk, totalPlay);
  }

  return {
    orderedIds,
    ordered,
    points: walk.points,
    distanceMeters: walk.distanceMeters,
    durationSeconds: walk.durationSeconds,
    segments: walk.segments,
    walkProvider,
    timeline,
    rationale,
    llmUsed,
    summary: {
      totalMinutes: totalWait + totalWalk + totalPlay,
      waitMinutes: totalWait,
      walkMinutes: totalWalk,
      playMinutes: totalPlay,
      endLabel: formatClock(cursor),
    },
  };
}
