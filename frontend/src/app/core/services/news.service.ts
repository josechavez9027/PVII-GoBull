import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type NewsCategory =
  | 'MERCADOS'
  | 'EMPRESAS'
  | 'ECONOMIA'
  | 'CRIPTO'
  | 'DIVISAS'
  | 'ENERGIA'
  | 'TECNOLOGIA'
  | 'SALUD'
  | 'OTROS';

export interface NewsSymbol {
  symbol: string;
  matchScore: number | null;
  sentiment: number | null;
}

export interface NewsArticle {
  id: string;
  providerId: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  language: string;
  publishedAt: string;
  category: NewsCategory;
  sentiment: number | null;
  viewCount: number;
  favoriteCount: number;
  isFavorite: boolean;
  inPortfolio: boolean;
  score?: number;
  symbols: NewsSymbol[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedNewsResponse {
  news: NewsArticle[];
  pagination: PaginationMeta;
}

export interface NewsCategoryCount {
  category: NewsCategory;
  count: number;
}

export interface ListNewsFilters {
  category?: NewsCategory | '';
  q?: string;
  from?: string;
  to?: string;
  symbol?: string;
  sort?: 'recent' | 'relevance';
  page?: number;
  limit?: number;
}

export interface ListFavoritesFilters {
  category?: NewsCategory | '';
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NewsService {
  private apiUrl = 'http://localhost:3000/api/v1/news';

  constructor(private http: HttpClient) {}

  getNews(filters?: ListNewsFilters): Observable<PaginatedNewsResponse> {
    let params = new HttpParams();
    if (filters) {
      if (filters.category) params = params.set('category', filters.category);
      if (filters.q?.trim()) params = params.set('q', filters.q.trim());
      if (filters.from) params = params.set('from', filters.from);
      if (filters.to) params = params.set('to', filters.to);
      if (filters.symbol?.trim()) params = params.set('symbol', filters.symbol.trim().toUpperCase());
      if (filters.sort) params = params.set('sort', filters.sort);
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
    }
    return this.http.get<PaginatedNewsResponse>(this.apiUrl, { params, withCredentials: true });
  }

  getCategories(): Observable<{ categories: NewsCategoryCount[] }> {
    return this.http.get<{ categories: NewsCategoryCount[] }>(`${this.apiUrl}/categories`, {
      withCredentials: true,
    });
  }

  getRelevant(filters?: ListNewsFilters): Observable<PaginatedNewsResponse> {
    let params = new HttpParams();
    if (filters) {
      if (filters.category) params = params.set('category', filters.category);
      if (filters.q?.trim()) params = params.set('q', filters.q.trim());
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
    }
    return this.http.get<PaginatedNewsResponse>(`${this.apiUrl}/relevant`, { params, withCredentials: true });
  }

  getFavorites(filters?: ListFavoritesFilters): Observable<PaginatedNewsResponse> {
    let params = new HttpParams();
    if (filters) {
      if (filters.category) params = params.set('category', filters.category);
      if (filters.q?.trim()) params = params.set('q', filters.q.trim());
      if (filters.page) params = params.set('page', filters.page.toString());
      if (filters.limit) params = params.set('limit', filters.limit.toString());
    }
    return this.http.get<PaginatedNewsResponse>(`${this.apiUrl}/favorites`, { params, withCredentials: true });
  }

  getArticle(id: string): Observable<{ article: NewsArticle }> {
    return this.http.get<{ article: NewsArticle }>(`${this.apiUrl}/${id}`, { withCredentials: true });
  }

  recordView(id: string): Observable<{ viewed: boolean; viewCount: number }> {
    return this.http.post<{ viewed: boolean; viewCount: number }>(
      `${this.apiUrl}/${id}/view`,
      {},
      { withCredentials: true },
    );
  }

  addFavorite(id: string): Observable<{ isFavorite: boolean; favoriteCount: number }> {
    return this.http.post<{ isFavorite: boolean; favoriteCount: number }>(
      `${this.apiUrl}/${id}/favorite`,
      {},
      { withCredentials: true },
    );
  }

  removeFavorite(id: string): Observable<{ isFavorite: boolean; favoriteCount: number }> {
    return this.http.delete<{ isFavorite: boolean; favoriteCount: number }>(
      `${this.apiUrl}/${id}/favorite`,
      { withCredentials: true },
    );
  }
}
