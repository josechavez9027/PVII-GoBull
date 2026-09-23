import { Request, Response } from 'express';
import { OperationsService } from './operations.service';
import { createOperationSchema, listOperationsQuerySchema } from './operations.schemas';

export class OperationsController {
  constructor(private readonly operationsService = new OperationsService()) {
    this.list = this.list.bind(this);
    this.create = this.create.bind(this);
    this.remove = this.remove.bind(this);
    this.positions = this.positions.bind(this);
    this.summary = this.summary.bind(this);
  }

  async list(req: Request, res: Response) {
    try {
      const filters = listOperationsQuerySchema.parse(req.query);
      const operations = await this.operationsService.list(req.user.id, filters);
      res.json({ operations });
    } catch (error: any) {
      res.status(400).json({ message: error.message ?? 'Parametros de consulta invalidos' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const data = createOperationSchema.parse(req.body);
      const operation = await this.operationsService.create(req.user.id, {
        type: data.type,
        name: data.name,
        symbol: data.symbol ?? null,
        date: data.date,
        qty: data.qty,
        totalPrice: data.totalPrice,
      });
      res.status(201).json({ operation });
    } catch (error: any) {
      const status = error.status ?? 400;
      const issues = error.issues ?? error.errors;
      const code = error.code ?? (issues ? 'VALIDATION_ERROR' : 'BAD_REQUEST');
      const message = issues?.[0]?.message ?? error.message ?? 'No se pudo crear la operacion';
      res.status(status).json({
        code,
        message,
        error: { code, message, details: issues ?? {} },
      });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      await this.operationsService.remove(req.user.id, String(req.params.id));
      res.json({ message: 'Operacion eliminada correctamente' });
    } catch (error: any) {
      const status = error.status ?? 400;
      const code = error.code ?? 'OPERATION_ERROR';
      const message = error.message ?? 'No se pudo eliminar la operacion';
      res.status(status).json({
        code,
        message,
        error: { code, message },
      });
    }
  }

  async positions(req: Request, res: Response) {
    try {
      const positions = await this.operationsService.positions(req.user.id);
      res.json({ positions });
    } catch (error: any) {
      res.status(500).json({ message: 'No se pudieron consultar las posiciones' });
    }
  }

  async summary(req: Request, res: Response) {
    try {
      const summary = await this.operationsService.summary(req.user.id);
      res.json({ summary });
    } catch (error: any) {
      res.status(500).json({ message: 'No se pudo calcular el resumen' });
    }
  }
}