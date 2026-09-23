export const operationTypes = ['DIV', 'DEP', 'RET', 'BUY', 'SELL', 'TAX'] as const;

export type OperationType = (typeof operationTypes)[number];

export interface OperationDto {
  id: string;
  type: OperationType;
  name: string;
  symbol: string | null;
  date: string;
  qty: number;
  totalPrice: number;
  createdAt: string;
}

export interface ListOperationsFilters {
  type?: OperationType | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
}

export interface CreateOperationInput {
  type: OperationType;
  name: string;
  symbol?: string | null | undefined;
  date?: string | undefined;
  qty?: number | undefined;
  totalPrice: number;
}

export interface Position {
  symbol: string;
  name: string;
  qty: number;
  avgCost: number;
  totalCost: number;
}

export interface CapitalSummary {
  caja: number;
  patrimonio: number;
  neutral: number;
}