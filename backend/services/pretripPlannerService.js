import { getAllAttractionsEnriched } from "../models/Attraction.js";
import {
  totalCostMinutes,
  parkEntrancePosition,
  parseClockToMinutes,
  DEFAULT_PARK_CLOSE_MINUTES,
  minutesToClock,
} from "./costModel.js";
import { buildCandidatePool } from "./attractionFilterService.js";
import { normalizeGoalModes, applyGoalScore } from "./goalModes.js";

/**
 * @typedef {object} PlannerPrefs
 * @property {number} availableMinutes
 * @property {string[]} mustPlayIds
 * @property {string[]} [avoidIds]
 * @property {'more_rides'|'hot_first'} [goalMode]
 * @property {'mild'|'mixed'|'thrill'} [thrillPreference]
 * @property {number} [maxWaitTolerance]
 * @property {string} [groupType]
 * @property {number} [childHeightCm]
 */

function thrillMatch(attraction, pref) {
  if (!pref || pref === "mixed") return 1;
  const level = attraction.thrill_level || "medium";
  if (pref === "mild") return level === "low" || level === "medium" ? 1 : 0.35;
  if (pref === "thrill") return level === "high" || level === "medium" ? 1 : 0.4;
  return 1;
}

function scoreCandidate(attraction, cost, opts) {
  const { mustSet, goalModes } = opts;
  let score = 1000 / Math.max(1, cost.totalMinutes);
  if (mustSet.has(attraction.id)) score += 500;
  score = applyGoalScore(score, attraction, cost.totalMinutes, goalModes);
  return score;
}

/**
 * 贪心：先排必玩，再在时间预算内尽量多玩
 * @param {PlannerPrefs} prefs
 */
export function buildPretripPlan(prefs) {
  const availableMinutes = Math.max(30, prefs.availableMinutes || 480);
  const mustPlayIds = [...new Set(prefs.mustPlayIds || [])].filter(Boolean);
  const avoidSet = new Set(prefs.avoidIds || []);
  const mustSet = new Set(mustPlayIds);
  const goalModes = normalizeGoalModes(prefs);
  const maxWait =
    typeof prefs.maxWaitTolerance === "number" && prefs.maxWaitTolerance > 0
      ? prefs.maxWaitTolerance
      : 120;

  const enriched = getAllAttractionsEnriched();
  const { eligible, mustPlayWarnings: heightWarnings } = buildCandidatePool(
    enriched,
    {
      groupType: prefs.groupType,
      childHeightCm: prefs.childHeightCm,
      must_play_ids: mustPlayIds,
      avoid_ids: [...avoidSet],
    },
    new Set()
  );
  const all = eligible.filter((a) => !avoidSet.has(a.id));
  const byId = new Map(all.map((a) => [a.id, a]));

  const warnings = [...heightWarnings.map((w) => w.reason)];
  for (const id of mustPlayIds) {
    if (!byId.has(id)) warnings.push(`必玩项目 ${id} 不存在、已关闭或身高不符`);
  }

  let current = parkEntrancePosition();
  const ordered = [];
  const done = new Set();
  let timeUsed = 0;
  let totalWait = 0;
  let totalWalk = 0;
  let totalExperience = 0;

  function tryAppend(attraction) {
    const cost = totalCostMinutes(current, attraction, attraction.waitMinutes);
    if (cost.waitMinutes > maxWait) return false;
    if (timeUsed + cost.totalMinutes > availableMinutes) return false;
    ordered.push({
      order: ordered.length + 1,
      id: attraction.id,
      name: attraction.name,
      zone: attraction.zone,
      waitMinutes: cost.waitMinutes,
      experienceMinutes: cost.experienceMinutes,
      walkMinutes: cost.walkMinutes,
      totalMinutes: cost.totalMinutes,
      isMustPlay: mustSet.has(attraction.id),
      position: {
        x: attraction.position_x,
        y: attraction.position_y,
        z: attraction.position_z,
      },
    });
    timeUsed += cost.totalMinutes;
    totalWait += cost.waitMinutes;
    totalWalk += cost.walkMinutes;
    totalExperience += cost.experienceMinutes;
    current = attraction;
    done.add(attraction.id);
    return true;
  }

  const remainingMust = [...mustPlayIds];
  while (remainingMust.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remainingMust.length; i++) {
      const a = byId.get(remainingMust[i]);
      if (!a || done.has(a.id)) continue;
      const cost = totalCostMinutes(current, a, a.waitMinutes);
      if (cost.waitMinutes > maxWait) continue;
      const score = scoreCandidate(a, cost, { mustSet, goalModes });
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      const skipped = remainingMust.splice(0, 1)[0];
      const a = byId.get(skipped);
      warnings.push(`必玩「${a?.name || skipped}」无法在时间/排队限制内排入`);
      continue;
    }
    const id = remainingMust.splice(bestIdx, 1)[0];
    const a = byId.get(id);
    if (!tryAppend(a)) {
      warnings.push(`必玩「${a.name}」排入失败（时间或排队超限）`);
    }
  }

  const pool = all.filter((a) => !done.has(a.id));
  while (pool.length) {
    let best = null;
    let bestScore = -Infinity;
    let bestCost = null;
    for (const a of pool) {
      const cost = totalCostMinutes(current, a, a.waitMinutes);
      if (cost.waitMinutes > maxWait) continue;
      if (timeUsed + cost.totalMinutes > availableMinutes) continue;
      const score = scoreCandidate(a, cost, { mustSet, goalModes });
      if (score > bestScore) {
        bestScore = score;
        best = a;
        bestCost = cost;
      }
    }
    if (!best) break;
    tryAppend(best);
    const idx = pool.findIndex((x) => x.id === best.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  const mustCovered = mustPlayIds.filter((id) => done.has(id));
  const mustMissed = mustPlayIds.filter((id) => !done.has(id));

  return {
    ordered,
    summary: {
      rideCount: ordered.length,
      availableMinutes,
      usedMinutes: Math.round(timeUsed),
      remainingMinutes: Math.max(0, Math.round(availableMinutes - timeUsed)),
      totalWaitMinutes: Math.round(totalWait),
      totalWalkMinutes: Math.round(totalWalk * 10) / 10,
      totalExperienceMinutes: Math.round(totalExperience),
      mustPlayTotal: mustPlayIds.length,
      mustPlayCovered: mustCovered.length,
      mustPlayMissed: mustMissed,
    },
    warnings,
    attractionIds: ordered.map((o) => o.id),
  };
}

/**
 * @param {{ entryTime?: string, exitTime?: string, parkDate?: string }} times
 */
export function availableMinutesFromTimes(times) {
  const entry = parseClockToMinutes(times.entryTime) ?? 9 * 60;
  const exit = parseClockToMinutes(times.exitTime) ?? DEFAULT_PARK_CLOSE_MINUTES;
  return Math.max(0, exit - entry);
}

export { minutesToClock };
