import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type InstrumentKind = 'STOCK' | 'ETF' | 'OTHER';

export interface Instrument {
  symbol: string;
  name: string;
  market: string;
  kind: InstrumentKind;
}

@Injectable({
  providedIn: 'root',
})
export class InstrumentsService {
  private apiUrl = 'http://localhost:3000/api/v1/instruments';

  constructor(private http: HttpClient) {}

  suggest(q: string, limit = 8): Observable<{ instruments: Instrument[] }> {
    const params = new HttpParams().set('s', q.trim()).set('limit', String(limit));
    return this.http.get<{ instruments: Instrument[] }>(this.apiUrl, { params });
  }
}
