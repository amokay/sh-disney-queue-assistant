import { buildWalkFromSceneToAttraction } from "./walkFromPointService.js";

/** 场景单位 → 步行分钟（直线降级用） */
export const SCENE_UNITS_PER_WALK_MINUTE = 2;

/* ──── 步行路线缓存 ──── */
const _walkCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟
const CACHE_COORD_PRECISION = 0.5; // 场景坐标分组精度

function _walkCacheKey(sceneX, sceneZ, attractionId) {
  const rx = Math.round(sceneX / CACHE_COORD_PRECISION) * CACHE_COORD_PRECISION;
  const rz = Math.round(sceneZ / CACHE_COORD_PRECISION) * CACHE_COORD_PRECISION;
  return `${rx},${rz}->${attractionId}`;
}

/**
 * @param {{ position_x: number, position_y?: number, position_z: number }} a
 * @param {{ position_x: number, position_y?: number, position_z: number }} b
 */
export function sceneDistance(a, b) {
  const dx = a.position_x - b.position_x;
  const dy = (a.position_y ?? 0) - (b.position_y ?? 0);
  const dz = a.position_z - b.position_z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 直线距离计算步行时间（同步，用于降级 & pretrip）
 * @param {{ position_x: number, position_y?: number, position_z: number }} from
 * @param {{ position_x: number, position_y?: number, position_z: number }} to
 */
export function walkMinutesBetween(from, to) {
  return sceneDistance(from, to) / SCENE_UNITS_PER_WALK_MINUTE;
}

/**
 * 实际步行路线计算步行时间（异步，带缓存 + 降级）
 * @param {{ position_x: number, position_z: number }} from
 * @param {{ id?: string, position_x: number, position_z: number }} to
 * @returns {Promise<number>} 步行分钟
 */
export async function walkMinutesBetweenAsync(from, to) {
  // 目标无 id 时无法调用步行路线 API，降级为直线
  if (!to.id) return walkMinutesBetween(from, to);

  const sceneX = from.position_x;
  const sceneZ = from.position_z;
  const key = _walkCacheKey(sceneX, sceneZ, to.id);

  // 查缓存
  const cached = _walkCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.walkMinutes;
  }

  try {
    const result = await buildWalkFromSceneToAttraction(sceneX, sceneZ, to.id);
    const walkMin = Math.round((result.durationSeconds / 60) * 10) / 10;
    _walkCache.set(key, { walkMinutes: walkMin, ts: Date.now() });
    return walkMin;
  } catch (e) {
    console.warn("[costModel] 步行路线API失败，降级为直线:", e?.message || e);
    return walkMinutesBetween(from, to);
  }
}

/**
 * Step1：有效等待 = 基础排队（权益修正留 Step3 benefitRuleService）
 * @param {number} baseWaitMinutes
 */
export function effectiveWaitMinutes(baseWaitMinutes) {
  const w = typeof baseWaitMinutes === "number" && !Number.isNaN(baseWaitMinutes) ? baseWaitMinutes : 20;
  return Math.max(0, Math.round(w));
}

/**
 * @param {{ experience_duration_minutes?: number }} attraction
 */
export function experienceMinutes(attraction) {
  const e = attraction.experience_duration_minutes;
  return typeof e === "number" && e > 0 ? e : 20;
}

/**
 * 同步版本：从 from 到 attraction 玩完该项目的总时间成本（直线距离）
 */
export function totalCostMinutes(from, attraction, baseWaitMinutes) {
  const walk = walkMinutesBetween(from, attraction);
  const wait = effectiveWaitMinutes(baseWaitMinutes);
  const exp = experienceMinutes(attraction);
  return {
    walkMinutes: Math.round(walk * 10) / 10,
    waitMinutes: wait,
    experienceMinutes: exp,
    totalMinutes: Math.round((walk + wait + exp) * 10) / 10,
  };
}

/**
 * 异步版本：使用实际步行路线计算总时间成本
 */
export async function totalCostMinutesAsync(from, attraction, baseWaitMinutes) {
  const walk = await walkMinutesBetweenAsync(from, attraction);
  const wait = effectiveWaitMinutes(baseWaitMinutes);
  const exp = experienceMinutes(attraction);
  return {
    walkMinutes: Math.round(walk * 10) / 10,
    waitMinutes: wait,
    experienceMinutes: exp,
    totalMinutes: Math.round((walk + wait + exp) * 10) / 10,
  };
}

/**
 * 批量异步计算多个景点的总时间成本（并发限制 5）
 * @param {{ position_x: number, position_z: number }} from
 * @param {Array} attractions
 * @param {(a: any) => number} getWaitFn 获取排队时间的函数
 * @returns {Promise<Map<string, object>>} attractionId → cost
 */
export async function batchTotalCostMinutesAsync(from, attractions, getWaitFn) {
  const CONCURRENCY = 5;
  const results = new Map();

  for (let i = 0; i < attractions.length; i += CONCURRENCY) {
    const batch = attractions.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((a) => totalCostMinutesAsync(from, a, getWaitFn(a)))
    );
    for (let j = 0; j < batch.length; j++) {
      const a = batch[j];
      if (settled[j].status === "fulfilled") {
        results.set(a.id, settled[j].value);
      } else {
        // 单项失败时降级为直线
        results.set(a.id, totalCostMinutes(from, a, getWaitFn(a)));
      }
    }
  }
  return results;
}

export function parkEntrancePosition() {
  return { position_x: 0, position_y: 0, position_z: 0 };
}

/** @param {string} hhmm 如 "09:30" */
export function parseClockToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 默认闭园 21:00 */
export const DEFAULT_PARK_CLOSE_MINUTES = 21 * 60;
