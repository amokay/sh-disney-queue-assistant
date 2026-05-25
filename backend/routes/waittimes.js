import { Router } from "express";
import * as ctrl from "../controllers/waittimesController.js";

const router = Router();
router.get("/", ctrl.listWaitTimes);

export default router;
