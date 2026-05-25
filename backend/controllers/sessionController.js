import {
  createSession,
  savePreferences,
  getSessionById,
  setSessionMode,
  markProgress,
} from "../models/Session.js";
import { parseClockToMinutes, DEFAULT_PARK_CLOSE_MINUTES } from "../services/costModel.js";
import { updateSessionLocation } from "../models/Session.js";
import { readGeoReferenceFromDisk, latLngToSceneXZ } from "../services/geoProject.js";

export function postCreateSession(req, res) {
  try {
    const body = req.body || {};
    const entryMinutes = parseClockToMinutes(body.entryTime) ?? 9 * 60;
    const exitMinutes = parseClockToMinutes(body.exitTime) ?? DEFAULT_PARK_CLOSE_MINUTES;
    const session = createSession({
      mode: body.mode || "pretrip",
      parkDate: body.parkDate,
      entryMinutes,
      exitMinutes,
    });
    res.status(201).json({ session });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function postSessionPreferences(req, res) {
  try {
    const sessionId = req.body?.sessionId || req.params?.id;
    if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });
    if (!getSessionById(sessionId)) return res.status(404).json({ error: "session 不存在" });

    savePreferences(sessionId, {
      groupType: req.body.groupType,
      thrillPreference: req.body.thrillPreference,
      goalMode: req.body.goalMode,
      mustPlayIds: req.body.mustPlayIds,
      avoidIds: req.body.avoidIds,
      maxWaitTolerance: req.body.maxWaitTolerance,
      ...req.body,
    });
    res.json({ ok: true, session: getSessionById(sessionId) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function getSession(req, res) {
  const session = getSessionById(req.params.id);
  if (!session) return res.status(404).json({ error: "session 不存在" });
  res.json({ session });
}

export function postSessionProgress(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const attractionId = req.body?.attractionId;
    const status = req.body?.status || "done";
    if (!sessionId || !attractionId) {
      return res.status(400).json({ error: "需要 sessionId 与 attractionId" });
    }
    if (!getSessionById(sessionId)) return res.status(404).json({ error: "session 不存在" });
    markProgress(sessionId, attractionId, status);
    res.json({ ok: true, session: getSessionById(sessionId) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function postSessionLocation(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const lat = Number(req.body?.lat ?? req.body?.gcj_lat);
    const lng = Number(req.body?.lng ?? req.body?.gcj_lng);
    if (!sessionId) return res.status(400).json({ error: "需要 sessionId" });
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "需要有效 lat/lng（GCJ-02）" });
    }
    if (!getSessionById(sessionId)) return res.status(404).json({ error: "session 不存在" });

    const ref = readGeoReferenceFromDisk();
    if (!ref) return res.status(500).json({ error: "缺少 geo_reference.json" });
    const { x, z } = latLngToSceneXZ(lat, lng, ref);
    updateSessionLocation(sessionId, {
      gcj_lat: lat,
      gcj_lng: lng,
      scene_x: x,
      scene_z: z,
    });

    res.json({
      ok: true,
      location: { gcj_lat: lat, gcj_lng: lng, scene_x: x, scene_z: z },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function postSessionMode(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const mode = req.body?.mode;
    if (!sessionId || !mode) return res.status(400).json({ error: "需要 sessionId 与 mode" });
    if (!getSessionById(sessionId)) return res.status(404).json({ error: "session 不存在" });
    setSessionMode(sessionId, mode);
    res.json({ ok: true, session: getSessionById(sessionId) });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
