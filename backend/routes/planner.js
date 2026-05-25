import { Router } from "express";
import * as ctrl from "../controllers/plannerController.js";

const router = Router();
router.get("/attractions/metadata", ctrl.getAttractionsMetadataHandler);
router.post("/pretrip-plan", ctrl.postPretripPlan);
router.post("/replan", ctrl.postReplan);
router.get("/next-recommendation", ctrl.getNextRecommendationHandler);
router.get("/current-state", ctrl.getCurrentState);
router.get("/opportunities", ctrl.getOpportunities);
router.post("/adopt-opportunity", ctrl.postAdoptOpportunity);
router.get("/mock-scenarios", ctrl.getMockScenarios);
router.post("/mock-scenario", ctrl.postMockScenario);
router.post("/walk-to-next", ctrl.postWalkToNext);

export default router;
