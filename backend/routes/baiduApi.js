import { Router } from "express";
import { postBaiduWalkRoute } from "../controllers/routeController.js";

const router = Router();

/** 与 POST /api/route/baidu-walk 相同，便于子路由 404 时走备用路径 */
router.post("/scene-walk-polyline", postBaiduWalkRoute);

export default router;
