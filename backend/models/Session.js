import { randomUUID } from "crypto";
import { db } from "../db/connection.js";

export function createSession(payload = {}) {
  const id = payload.id || randomUUID();
  const entryMinutes = payload.entryMinutes ?? 9 * 60;
  const exitMinutes = payload.exitMinutes ?? 21 * 60;
  db.prepare(
    `
    INSERT INTO planner_sessions (id, mode, park_date, entry_minutes, exit_minutes, status, current_attraction_id)
    VALUES (@id, @mode, @park_date, @entry_minutes, @exit_minutes, 'active', @current_attraction_id)
  `
  ).run({
    id,
    mode: payload.mode || "pretrip",
    park_date: payload.parkDate || new Date().toISOString().slice(0, 10),
    entry_minutes: entryMinutes,
    exit_minutes: exitMinutes,
    current_attraction_id: payload.currentAttractionId || null,
  });
  return getSessionById(id);
}

export function savePreferences(sessionId, prefs) {
  const must = Array.isArray(prefs.mustPlayIds) ? prefs.mustPlayIds : [];
  const avoid = Array.isArray(prefs.avoidIds) ? prefs.avoidIds : [];
  db.prepare(
    `
    INSERT INTO session_preferences (
      session_id, group_type, thrill_preference, goal_mode,
      must_play_ids, avoid_ids, max_wait_tolerance, preferences_json
    ) VALUES (
      @session_id, @group_type, @thrill_preference, @goal_mode,
      @must_play_ids, @avoid_ids, @max_wait_tolerance, @preferences_json
    )
    ON CONFLICT(session_id) DO UPDATE SET
      group_type = excluded.group_type,
      thrill_preference = excluded.thrill_preference,
      goal_mode = excluded.goal_mode,
      must_play_ids = excluded.must_play_ids,
      avoid_ids = excluded.avoid_ids,
      max_wait_tolerance = excluded.max_wait_tolerance,
      preferences_json = excluded.preferences_json
  `
  ).run({
    session_id: sessionId,
    group_type: prefs.groupType || null,
    thrill_preference: prefs.thrillPreference || "mixed",
    goal_mode: prefs.goalMode || "more_rides",
    must_play_ids: JSON.stringify(must),
    avoid_ids: JSON.stringify(avoid),
    max_wait_tolerance: prefs.maxWaitTolerance ?? null,
    preferences_json: JSON.stringify(prefs),
  });
  touchSession(sessionId);
}

export function getSessionById(id) {
  const row = db.prepare(`SELECT * FROM planner_sessions WHERE id = ?`).get(id);
  if (!row) return null;
  const pref = db.prepare(`SELECT * FROM session_preferences WHERE session_id = ?`).get(id);
  let preferences = null;
  if (pref) {
    preferences = {
      groupType: pref.group_type,
      thrillPreference: pref.thrill_preference,
      goalMode: pref.goal_mode,
      must_play_ids: pref.must_play_ids ? JSON.parse(pref.must_play_ids) : [],
      avoid_ids: pref.avoid_ids ? JSON.parse(pref.avoid_ids) : [],
      max_wait_tolerance: pref.max_wait_tolerance,
      raw: pref.preferences_json ? JSON.parse(pref.preferences_json) : null,
    };
  }
  let plan = null;
  if (row.plan_json) {
    try {
      plan = JSON.parse(row.plan_json);
    } catch {
      plan = null;
    }
  }
  const progress = db
    .prepare(`SELECT attraction_id, status, completed_at FROM session_progress WHERE session_id = ?`)
    .all(id);

  return { ...row, preferences, plan, progress };
}

export function saveSessionPlan(sessionId, plan) {
  db.prepare(
    `
    UPDATE planner_sessions
    SET plan_json = @plan_json, plan_version = plan_version + 1, updated_at = datetime('now')
    WHERE id = @id
  `
  ).run({ id: sessionId, plan_json: JSON.stringify(plan) });
  touchSession(sessionId);
}

export function setSessionMode(sessionId, mode) {
  db.prepare(`UPDATE planner_sessions SET mode = @mode, updated_at = datetime('now') WHERE id = @id`).run({
    id: sessionId,
    mode,
  });
}

export function setCurrentAttraction(sessionId, attractionId) {
  db.prepare(
    `UPDATE planner_sessions SET current_attraction_id = @aid, updated_at = datetime('now') WHERE id = @id`
  ).run({ id: sessionId, aid: attractionId || null });
}

export function markProgress(sessionId, attractionId, status = "done") {
  db.prepare(
    `
    INSERT INTO session_progress (session_id, attraction_id, status, completed_at)
    VALUES (@session_id, @attraction_id, @status, datetime('now'))
    ON CONFLICT(session_id, attraction_id) DO UPDATE SET
      status = excluded.status,
      completed_at = excluded.completed_at
  `
  ).run({ session_id: sessionId, attraction_id: attractionId, status });
  if (status === "done") setCurrentAttraction(sessionId, attractionId);
  touchSession(sessionId);
}

export function getProgressDoneIds(sessionId) {
  const rows = db
    .prepare(`SELECT attraction_id FROM session_progress WHERE session_id = ? AND status = 'done'`)
    .all(sessionId);
  return new Set(rows.map((r) => r.attraction_id));
}

function touchSession(sessionId) {
  db.prepare(`UPDATE planner_sessions SET updated_at = datetime('now') WHERE id = ?`).run(sessionId);
}

/**
 * @param {object} session row from getSessionById
 */
export function getUserScenePosition(session) {
  if (session?.last_scene_x != null && session?.last_scene_z != null) {
    return {
      position_x: session.last_scene_x,
      position_y: 0,
      position_z: session.last_scene_z,
    };
  }
  return null;
}

export function updateSessionLocation(sessionId, { gcj_lat, gcj_lng, scene_x, scene_z }) {
  db.prepare(
    `
    UPDATE planner_sessions SET
      last_gcj_lat = @gcj_lat,
      last_gcj_lng = @gcj_lng,
      last_scene_x = @scene_x,
      last_scene_z = @scene_z,
      last_location_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = @id
  `
  ).run({
    id: sessionId,
    gcj_lat,
    gcj_lng,
    scene_x,
    scene_z,
  });
  touchSession(sessionId);
}

export function setPinnedNext(sessionId, attractionId) {
  db.prepare(
    `UPDATE planner_sessions SET pinned_next_id = @aid, updated_at = datetime('now') WHERE id = @id`
  ).run({ id: sessionId, aid: attractionId || null });
}
