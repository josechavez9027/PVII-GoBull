import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { loadFuturesConfig } from "./futures.config";
import { FuturesController } from "./futures.controller";
import { YahooFuturesProvider } from "./futures.provider";
import { FuturesService } from "./futures.service";

const router = Router();
const config = loadFuturesConfig();
const provider = new YahooFuturesProvider({ baseUrl: config.baseUrl });
const service = new FuturesService(config, provider);
const controller = new FuturesController(service);

router.use(authenticate);

router.get("/panel", controller.panel.bind(controller));

export { service as futuresService };
export default router;
