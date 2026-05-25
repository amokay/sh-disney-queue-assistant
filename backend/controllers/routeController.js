import { planRoute as plan } from "../services/routeService.js";
import { buildSceneWalkPolyline } from "../services/amapWalkingSceneRoute.js";
import { buildBaiduSceneWalkPolyline } from "../services/baiduWalkingSceneRoute.js";
import { buildSmartItinerary } from "../services/smartRouteService.js";
import { getSessionById } from "../models/Session.js";

export async function postSmartPlanRoute(req, res) {
  try {
    const ids = req.body?.attractions;
    if (!Array.isArray(ids) || ids.length < 1) {
      return res.status(400).json({ error: "body.attractions 至少需要 1 个 id" });
    }
    const walk = req.body?.walk;
    const lockOrder = Boolean(req.body?.lockOrder);

    // 起点：优先用 body.startPosition；其次查 session.last_*；都没有则不传
    let startPosition = null;
    if (req.body?.startPosition && typeof req.body.startPosition === "object") {
      const sp = req.body.startPosition;
      if (
        Number.isFinite(Number(sp.gcj_lat)) &&
        Number.isFinite(Number(sp.gcj_lng)) &&
        Number.isFinite(Number(sp.scene_x)) &&
        Number.isFinite(Number(sp.scene_z))
      ) {
        startPosition = {
          gcj_lat: Number(sp.gcj_lat),
          gcj_lng: Number(sp.gcj_lng),
          scene_x: Number(sp.scene_x),
          scene_z: Number(sp.scene_z),
        };
      }
    }
    if (!startPosition && req.body?.sessionId) {
      const session = getSessionById(req.body.sessionId);
      if (
        session?.last_gcj_lat != null &&
        session?.last_gcj_lng != null &&
        session?.last_scene_x != null &&
        session?.last_scene_z != null
      ) {
        startPosition = {
          gcj_lat: Number(session.last_gcj_lat),
          gcj_lng: Number(session.last_gcj_lng),
          scene_x: Number(session.last_scene_x),
          scene_z: Number(session.last_scene_z),
        };
      }
    }

    const result = await buildSmartItinerary(ids, {
      walk: walk && typeof walk === "object" ? walk : undefined,
      lockOrder,
      startPosition,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function postBaiduWalkRoute(req, res) {
  try {
    const ids = req.body?.attractions;
    if (!Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json({ error: "body.attractions 必须为至少 2 个 id 的数组（顺序即游览顺序）" });
    }
    const result = await buildBaiduSceneWalkPolyline(ids);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export async function postAmapWalkRoute(req, res) {
  try {
    const ids = req.body?.attractions;
    if (!Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json({ error: "body.attractions 必须为至少 2 个 id 的数组（顺序即游览顺序）" });
    }
    const result = await buildSceneWalkPolyline(ids);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

export function postPlanRoute(req, res) {
  try {
    const ids = req.body?.attractions;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "body.attractions must be an array" });
    }
    const result = plan(ids);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
