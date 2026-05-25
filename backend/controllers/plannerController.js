import { getAttractionsMetadata } from "../models/Attraction.js";
import { getSessionById, saveSessionPlan, savePreferences } from "../models/Session.js";
import { buildPretripPlan, availableMinutesFromTimes } from "../services/pretripPlannerService.js";
import {
  getNextRecommendation,
  replanRemaining,
  getInParkSnapshot,
  adoptOpportunity,
} from "../services/inParkDecisionService.js";
import {
  applyMockScenario,
  listMockScenarios,
  getActiveMockScenario,
} from "../services/mockWaitService.js";
import { buildWalkFromSceneToAttraction } from "../services/walkFromPointService.js";

export function getAttractionsMetadataHandler(req, res) {
  try {
    res.json({ attractions: getAttractionsMetadata() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function postPretripPlan(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const session = sessionId ? getSessionById(sessionId) : null;
    const prefs = session?.preferences || {};

    const mustPlayIds = req.body?.mustPlayIds ?? prefs.must_play_ids ?? [];
    const availableMinutes =
      req.body?.availableMinutes ??
      (session
        ? Math.max(0, (session.exit_minutes ?? 21 * 60) - (session.entry_minutes ?? 9 * 60))
        : availableMinutesFromTimes({
            entryTime: req.body?.entryTime,
            exitTime: req.body?.exitTime,
          }));

    if (sessionId && req.body?.preferences) {
      savePreferences(sessionId, req.body.preferences);
    }

    const rawPrefs = prefs.raw || {};
    const plan = buildPretripPlan({
      availableMinutes,
      mustPlayIds,
      avoidIds: req.body?.avoidIds ?? prefs.avoid_ids,
      goalModes: req.body?.goalModes ?? rawPrefs.goalModes,
      goalMode: req.body?.goalMode ?? prefs.goal_mode,
      maxWaitTolerance: req.body?.maxWaitTolerance ?? prefs.max_wait_tolerance ?? 120,
      groupType: req.body?.groupType ?? prefs.groupType ?? rawPrefs.groupType,
      childHeightCm: req.body?.childHeightCm ?? rawPrefs.childHeightCm,
    });

    if (sessionId) saveSessionPlan(sessionId, plan);

    res.json({ plan, sessionId: sessionId || null });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function getNextRecommendationHandler(req, res) {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: "需要 sessionId" });
    const result = await getNextRecommendation(sessionId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function postReplan(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    if (!sessionId) return res.status(400).json({ error: "需要 sessionId" });
    const result = await replanRemaining(sessionId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function getMockScenarios(req, res) {
  res.json({ active: getActiveMockScenario(), scenarios: listMockScenarios() });
}

export async function getCurrentState(req, res) {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: "需要 sessionId" });
    res.json(await getInParkSnapshot(sessionId));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function getOpportunities(req, res) {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: "需要 sessionId" });
    const snap = await getInParkSnapshot(sessionId);
    res.json({
      sessionId,
      opportunities: snap.opportunities,
      next: snap.next,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function postAdoptOpportunity(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const attractionId = req.body?.attractionId;
    if (!sessionId || !attractionId) {
      return res.status(400).json({ error: "需要 sessionId 与 attractionId" });
    }
    res.json(await adoptOpportunity(sessionId, attractionId));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function postMockScenario(req, res) {
  try {
    const key = req.body?.scenario || req.body?.key;
    if (!key) return res.status(400).json({ error: "需要 scenario" });
    const applied = applyMockScenario(key);
    res.json({ ok: true, applied });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

/** 行中：LBS 场景坐标 → 下一站 步行折线 */
export async function postWalkToNext(req, res) {
  try {
    const scene_x = Number(req.body?.scene_x);
    const scene_z = Number(req.body?.scene_z);
    const attractionId = req.body?.attractionId;
    if (Number.isNaN(scene_x) || Number.isNaN(scene_z)) {
      return res.status(400).json({ error: "需要有效 scene_x / scene_z" });
    }
    if (!attractionId) return res.status(400).json({ error: "需要 attractionId" });
    const walk = await buildWalkFromSceneToAttraction(scene_x, scene_z, attractionId);
    res.json(walk);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
