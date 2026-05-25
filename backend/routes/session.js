import { Router } from "express";
import * as ctrl from "../controllers/sessionController.js";

const router = Router();
router.post("/create", ctrl.postCreateSession);
router.post("/preferences", ctrl.postSessionPreferences);
router.post("/progress", ctrl.postSessionProgress);
router.post("/location", ctrl.postSessionLocation);
router.post("/mode", ctrl.postSessionMode);
router.get("/:id", ctrl.getSession);

export default router;
