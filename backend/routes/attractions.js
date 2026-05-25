import { Router } from "express";
import * as ctrl from "../controllers/attractionsController.js";

const router = Router();
router.get("/", ctrl.listAttractions);
router.get("/:id", ctrl.getAttraction);

export default router;
