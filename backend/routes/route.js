import { Router } from "express";
import * as ctrl from "../controllers/routeController.js";

const router = Router();
router.post("/plan", ctrl.postPlanRoute);
router.post("/smart-plan", ctrl.postSmartPlanRoute);
router.post("/amap-walk", ctrl.postAmapWalkRoute);
router.post("/baidu-walk", ctrl.postBaiduWalkRoute);

export default router;
