import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type OperationType = 'DIV' | 'DEP' | 'RET' | 'BUY' | 'SELL' | 'TAX';

export interface Operation {
  id: string;
  type: OperationType;
  name: string;
  symbol: string | null;
  date: string;
  qty: number;
  totalPrice: number;
  createdAt: string;
}

export interface CreateOperationDto {
  type: OperationType;
  name: string;
  symbol?: string | null;
  date?: string;
  qty?: number;
  totalPrice: number;
}

export interface ListOperationsFilters {
  type?: OperationType | '';
  from?: string;
  to?: string;
  q?: string;
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

@Injectable({
  providedIn: 'root',
})
export class OperationsService {
  private apiUrl = 'http://localhost:3000/api/v1/operations';

  constructor(private http: HttpClient) {}

  getOperations(filters?: ListOperationsFilters): Observable<{ operations: Operation[] }> {
    let params = new HttpParams();
    if (filters) {
      if (filters.type) {
        params = params.set('type', filters.type);
      }
      if (filters.from) {
        params = params.set('from', filters.from);
      }
      if (filters.to) {
        params = params.set('to', filters.to);
      }
      if (filters.q?.trim()) {
        params = params.set('q', filters.q.trim());
      }
    }
    return this.http.get<{ operations: Operation[] }>(this.apiUrl, { params });
  }

  getPositions(): Observable<{ positions: Position[] }> {
    return this.http.get<{ positions: Position[] }>(`${this.apiUrl}/positions`);
  }

  getSummary(): Observable<{ summary: CapitalSummary }> {
    return this.http.get<{ summary: CapitalSummary }>(`${this.apiUrl}/summary`);
  }

  createOperation(data: CreateOperationDto): Observable<{ operation: Operation }> {
    return this.http.post<{ operation: Operation }>(this.apiUrl, data);
  }

  deleteOperation(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
