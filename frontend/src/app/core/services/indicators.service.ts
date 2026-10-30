import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type IndicatorStatus = 'fresh' | 'stale' | 'unavailable';

export interface IndicatorPoint {
  t: string;
  v: number;
}

export interface IndicatorItem {
  code: string;
  name: string;
  category: string;
  unit: string;
  decimals: number;
  value: number | null;
  changePct: number | null;
  asOf: string | null;
  status: IndicatorStatus;
  sparkline: IndicatorPoint[];
  intraday?: boolean;
}

export interface IndicatorGroup {
  category: string;
  items: IndicatorItem[];
}

export interface IndicatorsPanel {
  generatedAt: string;
  stale: boolean;
  configured: boolean;
  quota: { used: number; budget: number };
  groups: IndicatorGroup[];
}

export interface HistoryResponse {
  code: string;
  name: string;
  unit: string;
  decimals: number;
  range: string;
  granularity?: 'intraday' | 'daily';
  bucketMinutes?: number | null;
  points: IndicatorPoint[];
}

export interface CompareSeries {
  code: string;
  name: string;
  decimals: number;
  unit: string;
  base100: IndicatorPoint[];
  changePeriodPct: number | null;
}

export interface CompareResponse {
  range: string;
  series: CompareSeries[];
  missing: string[];
}

export type IndicatorRange = '1M' | '3M' | '6M' | '1Y' | '5Y';
export type LiveRange = '5MIN' | '1HR' | '1W' | '1M' | '1Y' | '2Y';
export type HistoryRange = IndicatorRange | LiveRange;

@Injectable({
  providedIn: 'root',
})
export class IndicatorsService {
  private apiUrl = 'http://localhost:3000/api/v1/indicators';

  constructor(private http: HttpClient) {}

  getPanel(): Observable<IndicatorsPanel> {
    return this.http.get<IndicatorsPanel>(this.apiUrl);
  }

  getHistory(code: string, range: HistoryRange): Observable<HistoryResponse> {
    const params = new HttpParams().set('range', range);
    return this.http.get<HistoryResponse>(`${this.apiUrl}/${code}/history`, { params });
  }

  getCompare(codes: string[], range: IndicatorRange): Observable<CompareResponse> {
    const params = new HttpParams().set('codes', codes.join(',')).set('range', range);
    return this.http.get<CompareResponse>(`${this.apiUrl}/compare`, { params });
  }
}
