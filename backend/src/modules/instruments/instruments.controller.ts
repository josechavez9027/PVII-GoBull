import { Request, Response } from 'express';
import { InstrumentsService } from './instruments.service';
import { suggestInstrumentsQuerySchema } from './instruments.schemas';

export class InstrumentsController {
  constructor(private readonly instrumentsService = new InstrumentsService()) {
    this.suggest = this.suggest.bind(this);
  }

  async suggest(req: Request, res: Response) {
    try {
      const query = suggestInstrumentsQuerySchema.parse(req.query);
      const instruments = await this.instrumentsService.suggest({
        q: query.s,
        limit: query.limit ?? 8,
      });
      res.json({ instruments });
    } catch (error: any) {
      const status = error.status ?? 400;
      const message = error.errors?.[0]?.message ?? error.message ?? 'Búsqueda inválida';
      res.status(status).json({ message });
    }
  }
}
