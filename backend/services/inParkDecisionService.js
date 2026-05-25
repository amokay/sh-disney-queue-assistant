import { getAttractionById, getAllAttractionsEnriched } from "../models/Attraction.js";
import {
  getSessionById,
  getProgressDoneIds,
  saveSessionPlan,
  getUserScenePosition,
  setPinnedNext,
} from "../models/Session.js";
import { buildPretripPlan } from "./pretripPlannerService.js";
import { totalCostMinutes, batchTotalCostMinutesAsync, totalCostMinutesAsync, effectiveWaitMinutes, parkEntrancePosition } from "./costModel.js";
import { buildCandidatePool } from "./attractionFilterService.js";
import { detectOpportunities } from "./opportunityDetector.js";
import { inferVisitState, detectOffRouteAttraction } from "./stateInferenceService.js";
import { getPlannerStep2Config } from "./plannerConfig.js";
import { normalizeGoalModes, applyGoalScore } from "./goalModes.js";

function currentPositionFromSession(session, doneIds) {
  const lbs = getUserScenePosition(session);
  if (lbs) return lbs;

  if (session.current_attraction_id) {
    const a = getAttractionById(session.current_attraction_id);
    if (a) return a;
  }
  const plan = session.plan;
  if (plan?.ordered?.length && doneIds.size) {
    for (let i = plan.ordered.length - 1; i >= 0; i--) {
      const step = plan.ordered[i];
      if (doneIds.has(step.id)) {
        const a = getAttractionById(step.id);
        if (a) return a;
      }
    }
  }
  return parkEntrancePosition();
}

function scoreCandidate(attraction, cost, goalModes, mustSet, oppBoost = 0) {
  let score = 1000 / Math.max(1, cost.totalMinutes);
  if (mustSet.has(attraction.id)) score += 600;
  score = applyGoalScore(score, attraction, cost.totalMinutes, goalModes);
  score += oppBoost;
  return score;
}

/**
 * @param {string} sessionId
 * @param {{ forceOpportunityId?: string }} [opts]
 */
export async function getInParkSnapshot(sessionId, opts = {}) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("session 不存在");

  const prefs = session.preferences || {};
  const goalModes = normalizeGoalModes(prefs);
  const doneIds = getProgressDoneIds(sessionId);
  const current = currentPositionFromSession(session, doneIds);
  const all = getAllAttractionsEnriched();
  const { eligible, excluded, mustPlayWarnings } = buildCandidatePool(all, prefs, doneIds);

  const avoidSet = new Set(prefs.avoid_ids || []);
  const mustSet = new Set(prefs.must_play_ids || []);
  const maxWait =
    typeof prefs.max_wait_tolerance === "number" && prefs.max_wait_tolerance > 0
      ? prefs.max_wait_tolerance
      : 999;

  const pinnedId = opts.forceOpportunityId || session.pinned_next_id;

  // 批量计算所有候选景点的步行成本（使用实际步行路线）
  const eligibleFiltered = eligible.filter((a) => !avoidSet.has(a.id));
  const costMap = await batchTotalCostMinutesAsync(current, eligibleFiltered, (a) => a.waitMinutes);

  let best = null;
  let bestCost = null;
  let bestScore = -Infinity;
  let chosenBecauseOpportunity = false;

  function pickBest(oppBoostMap) {
    let b = null;
    let c = null;
    let s = -Infinity;
    let opp = false;
    for (const a of eligibleFiltered) {
      const cost = costMap.get(a.id) || totalCostMinutes(current, a, a.waitMinutes);
      if (cost.waitMinutes > maxWait) continue;
      const boost = oppBoostMap.get(a.id) || 0;
      const score = scoreCandidate(a, cost, goalModes, mustSet, boost);
      if (score > s) {
        s = score;
        b = a;
        c = cost;
        opp = boost > 0;
      }
    }
    return { b, c, s, opp };
  }

  if (pinnedId) {
    const pinned = eligible.find((a) => a.id === pinnedId);
    if (pinned) {
      const cost = costMap.get(pinned.id) || (await totalCostMinutesAsync(current, pinned, pinned.waitMinutes));
      if (cost.waitMinutes <= maxWait) {
        best = pinned;
        bestCost = cost;
        bestScore = Infinity;
      }
    }
  }

  if (!best) {
    const prelim = pickBest(new Map());
    best = prelim.b;
    bestCost = prelim.c;
    bestScore = prelim.s;
    chosenBecauseOpportunity = prelim.opp;
  }

  let opportunities = await detectOpportunities(eligible, current, doneIds, best?.id || null);

  if (!pinnedId && opportunities.length) {
    const oppBoostMap = new Map();
    const cfg = getPlannerStep2Config().opportunity;
    for (const o of opportunities) {
      if (o.canReplacePrimary) oppBoostMap.set(o.id, cfg.scoreBoost ?? 120);
    }
    const boosted = pickBest(oppBoostMap);
    if (boosted.b && boosted.s > bestScore) {
      best = boosted.b;
      bestCost = boosted.c;
      chosenBecauseOpportunity = boosted.opp;
      opportunities = await detectOpportunities(eligible, current, doneIds, best.id);
    }
  }

  if (pinnedId && best) {
    chosenBecauseOpportunity = opportunities.some((o) => o.id === pinnedId);
  }

  const visitState = inferVisitState(
    session.last_scene_x != null
      ? { position_x: session.last_scene_x, position_z: session.last_scene_z }
      : null,
    session.current_attraction_id,
    best?.id || null
  );

  const offRoute = detectOffRouteAttraction(
    session.last_scene_x != null
      ? { position_x: session.last_scene_x, position_z: session.last_scene_z }
      : null,
    best?.id,
    all,
    doneIds
  );

  let next = null;
  let reason = "没有更多可推荐项目（均已玩过、关闭、身高不符或超出排队限制）";

  if (best && bestCost) {
    const goalModes = normalizeGoalModes(prefs);
    const reasonLines = [];
    if (chosenBecauseOpportunity) {
      reasonLines.push(`「${best.name}」排队明显变短，适合改道抢先体验`);
    } else {
      reasonLines.push(`从当前位置步行约 ${bestCost.walkMinutes} 分钟可达`);
      reasonLines.push(`预计排队 ${bestCost.waitMinutes} 分钟，游玩约 ${bestCost.experienceMinutes} 分钟`);
      if (mustSet.has(best.id)) reasonLines.push("属于你的必玩项目，优先安排");
      else if (goalModes.includes("closing_rush")) {
        reasonLines.push("闭园前优先选排队短、路程近的项目");
      } else if (goalModes.includes("hot_first") && best.popularity_level === "high") {
        reasonLines.push("热门项目，综合排队与路程较优");
      } else if (goalModes.includes("family") && best.family_friendly) {
        reasonLines.push("适合亲子，符合身高与温和体验偏好");
      } else if (goalModes.includes("more_rides")) {
        reasonLines.push("在剩余时间里能更高效多玩一项");
      } else if (goalModes.includes("no_thrill")) {
        reasonLines.push("已排除高刺激项目，推荐相对温和");
      } else {
        reasonLines.push("综合排队、步行与体验的总成本较低");
      }
    }
    reason = reasonLines.join("；");

    next = {
      id: best.id,
      name: best.name,
      zone: best.zone,
      effectiveWaitMinutes: bestCost.waitMinutes,
      experienceMinutes: bestCost.experienceMinutes,
      walkMinutes: bestCost.walkMinutes,
      totalMinutes: bestCost.totalMinutes,
      baseWaitMinutes: effectiveWaitMinutes(best.waitMinutes),
      isMustPlay: mustSet.has(best.id),
      isOpportunityPick: chosenBecauseOpportunity,
      reasonLines,
      position: { x: best.position_x, y: best.position_y, z: best.position_z },
    };
  }

  return {
    sessionId,
    next,
    reason,
    opportunities,
    visitState,
    offRoute,
    excluded: excluded.slice(0, 12),
    mustPlayWarnings,
    doneCount: doneIds.size,
    location: session.last_gcj_lat
      ? {
          gcj_lat: session.last_gcj_lat,
          gcj_lng: session.last_gcj_lng,
          scene_x: session.last_scene_x,
          scene_z: session.last_scene_z,
          updatedAt: session.last_location_at,
        }
      : null,
    currentAnchorId: session.current_attraction_id || null,
  };
}

export async function getNextRecommendation(sessionId) {
  return getInParkSnapshot(sessionId);
}

export async function replanRemaining(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("session 不存在");

  const doneIds = getProgressDoneIds(sessionId);
  const prefs = session.preferences || {};
  const mustRemaining = (prefs.must_play_ids || []).filter((id) => !doneIds.has(id));

  const entry = session.entry_minutes ?? 9 * 60;
  const exit = session.exit_minutes ?? 21 * 60;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const availableMinutes = Math.max(60, exit - Math.max(entry, nowMinutes));

  const plan = buildPretripPlan({
    availableMinutes,
    mustPlayIds: mustRemaining,
    avoidIds: [...(prefs.avoid_ids || []), ...doneIds],
    goalModes: normalizeGoalModes(prefs),
    goalMode: prefs.goal_mode,
    maxWaitTolerance: prefs.max_wait_tolerance ?? 120,
    groupType: prefs.groupType,
    childHeightCm: prefs.raw?.childHeightCm ?? prefs.child_height_cm,
  });

  saveSessionPlan(sessionId, plan);
  setPinnedNext(sessionId, null);
  const snapshot = await getInParkSnapshot(sessionId);

  return { plan, next: snapshot, replannedAt: now.toISOString() };
}

export async function adoptOpportunity(sessionId, attractionId) {
  setPinnedNext(sessionId, attractionId);
  return getInParkSnapshot(sessionId, { forceOpportunityId: attractionId });
}
