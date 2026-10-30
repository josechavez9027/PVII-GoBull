import { Request, Response } from "express";
import { compareQuerySchema, historyQuerySchema } from "./indicators.schemas";
import { IndicatorsProviderError } from "./indicators.provider";
import type { IndicatorsService } from "./indicators.service";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

export class IndicatorsController {
  constructor(private service: IndicatorsService) {}

  async panel(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await this.service.panel());
    } catch (error) {
      res.status(503).json({
        error: "INDICATORS_PROVIDER_UNAVAILABLE",
        message: errorMessage(error),
      });
    }
  }

  async history(req: Request, res: Response): Promise<void> {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "INDICATOR_RANGE_INVALID" });
      return;
    }
    try {
      res.json(await this.service.history(String(req.params.code), parsed.data.range));
    } catch (error) {
      if (error instanceof IndicatorsProviderError && error.kind === "BAD_REQUEST") {
        res.status(404).json({ error: "INDICATOR_NOT_FOUND" });
        return;
      }
      res.status(503).json({
        error: "INDICATORS_PROVIDER_UNAVAILABLE",
        message: errorMessage(error),
      });
    }
  }

  async compare(req: Request, res: Response): Promise<void> {
    const parsed = compareQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "INDICATOR_RANGE_INVALID" });
      return;
    }
    if (parsed.data.codes.length === 0) {
      res.status(400).json({ error: "TOO_FEW_CODES" });
      return;
    }
    if (parsed.data.codes.length > 6) {
      res.status(400).json({ error: "TOO_MANY_CODES" });
      return;
    }
    try {
      res.json(await this.service.compare(parsed.data.codes, parsed.data.range));
    } catch (error) {
      if (error instanceof IndicatorsProviderError && error.kind === "BAD_REQUEST") {
        res.status(404).json({ error: "INDICATOR_NOT_FOUND" });
        return;
      }
      res.status(503).json({
        error: "INDICATORS_PROVIDER_UNAVAILABLE",
        message: errorMessage(error),
      });
    }
  }

  async syncStatus(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await this.service.syncStatus());
    } catch (error) {
      res.status(503).json({
        error: "INDICATORS_PROVIDER_UNAVAILABLE",
        message: errorMessage(error),
      });
    }
  }

  async sync(_req: Request, res: Response): Promise<void> {
    if (!this.service.isConfigured) {
      res.status(503).json({ error: "INDICATORS_PROVIDER_NOT_CONFIGURED" });
      return;
    }
    if (await this.service.budgetExhausted()) {
      res.status(429).json({ error: "INDICATORS_BUDGET_EXHAUSTED" });
      return;
    }
    const result = this.service.claimManualSync();
    if (result === "BUSY") {
      res.status(429).json({ error: "INDICATORS_SYNC_IN_PROGRESS" });
      return;
    }
    if (result === "THROTTLED") {
      res.status(429).json({ error: "INDICATORS_SYNC_THROTTLED", retryAfterSeconds: 300 });
      return;
    }
    res.status(202).json({ status: "STARTED" });
  }
}
