import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type FuturesPeriod = '1D' | '1M' | '3M' | 'YTD';

export type FuturesCategory =
  'RATES' | 'CURRENCIES' | 'METALS' | 'SOFTS' | 'ENERGY' | 'INDICES' | 'GRAINS';

export type FuturesChanges = Record<FuturesPeriod, number | null>;

export const FUTURES_PERIODS: FuturesPeriod[] = ['1D', '1M', '3M', 'YTD'];

export const FUTURES_CATEGORY_LABELS: Record<FuturesCategory, string> = {
  RATES: 'Renta fija',
  CURRENCIES: 'Divisas',
  METALS: 'Metales',
  SOFTS: 'Blandos',
  ENERGY: 'Energía',
  INDICES: 'Índices',
  GRAINS: 'Granos',
};

export interface FuturesItem {
  code: string;
  name: string;
  category: FuturesCategory;
  yahooSymbol: string;
  unit: string;
  decimals: number;
  price: number | null;
  changes: FuturesChanges;
  asOf: string | null;
  available: boolean;
}

export interface FuturesPanel {
  generatedAt: string;
  stale: boolean;
  items: FuturesItem[];
  disclaimer: string;
}

@Injectable({
  providedIn: 'root',
})
export class FuturesService {
  private apiUrl = 'http://localhost:3000/api/v1/futures';

  constructor(private http: HttpClient) {}

  getPanel(): Observable<FuturesPanel> {
    return this.http.get<FuturesPanel>(`${this.apiUrl}/panel`);
  }
}
