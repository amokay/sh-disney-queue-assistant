import { Router } from "express";
import { amapDirectionDriving, amapDirectionWalking } from "../services/amapWebService.js";
import { postAmapWalkRoute } from "../controllers/routeController.js";

const router = Router();

/** 与 POST /api/route/amap-walk 相同，便于排查子路由 404 时走备用路径 */
router.post("/scene-walk-polyline", postAmapWalkRoute);

/**
 * 高德步行路径（GCJ-02）。query: origin=lng,lat&destination=lng,lat
 * 不在浏览器暴露 Key，由本后端转发。
 */
router.get("/direction/walking", async (req, res) => {
  try {
    const origin = String(req.query.origin || "");
    const destination = String(req.query.destination || "");
    if (!origin || !destination) {
      return res.status(400).json({ error: "需要 query: origin=经度,纬度&destination=经度,纬度（GCJ-02）" });
    }
    const data = await amapDirectionWalking(origin, destination);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

/**
 * 高德驾车路径（GCJ-02）
 */
router.get("/direction/driving", async (req, res) => {
  try {
    const origin = String(req.query.origin || "");
    const destination = String(req.query.destination || "");
    if (!origin || !destination) {
      return res.status(400).json({ error: "需要 query: origin=经度,纬度&destination=经度,纬度（GCJ-02）" });
    }
    const data = await amapDirectionDriving(origin, destination);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

export default router;
