import { Request, Response } from "express";
import type { FuturesService } from "./futures.service";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

export class FuturesController {
  constructor(private service: FuturesService) {}

  async panel(_req: Request, res: Response): Promise<void> {
    try {
      res.json(await this.service.panel());
    } catch (error) {
      res.status(503).json({
        error: "FUTURES_UNAVAILABLE",
        message: errorMessage(error),
      });
    }
  }
}
