import { Router } from "express";
import { IndicatorsController } from "./indicators.controller";
import { IndicatorsService } from "./indicators.service";
import { FmpProvider } from "./indicators.provider";
import { IndicatorQuotaService } from "./indicators.quota";
import { loadIndicatorsConfig } from "./indicators.config";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();
const config = loadIndicatorsConfig();
const provider = new FmpProvider({
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
});
const quota = new IndicatorQuotaService(config.dailyBudget);
const service = new IndicatorsService(config, provider, quota);
const controller = new IndicatorsController(service);

router.use(authenticate);

router.get("/compare", controller.compare.bind(controller));
router.get("/sync-status", controller.syncStatus.bind(controller));
router.post("/sync", controller.sync.bind(controller));
router.get("/:code/history", controller.history.bind(controller));
router.get("/", controller.panel.bind(controller));

export { service as indicatorsService };
export default router;
