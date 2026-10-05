import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  NewsService,
  NewsArticle,
  NewsCategory,
  NewsCategoryCount,
  PaginationMeta,
} from '../../core/services/news.service';
import { NewsCardComponent } from './news-card.component';
import { NewsDetailComponent } from './news-detail.component';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [CommonModule, FormsModule, NewsCardComponent, NewsDetailComponent],
  templateUrl: './news.component.html',
  styleUrl: './news.component.css',
})
export class NewsComponent implements OnInit, OnDestroy {
  // Estado de datos
  articles: NewsArticle[] = [];
  categories: NewsCategoryCount[] = [];
  selectedArticle: NewsArticle | null = null;
  isLoading = false;
  isLoadingDetail = false;
  errorMessage = '';
  detailErrorMessage = '';

  // Filtros activos
  selectedCategory: NewsCategory | '' = '';
  searchQuery = '';
  sortOption: 'recent' | 'relevance' = 'recent';
  onlyFavorites = false;

  // Paginación
  pagination: PaginationMeta = {
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
  };

  // Debounce para búsqueda
  private searchSubject = new Subject<string>();
  private subs: Subscription[] = [];

  constructor(
    private newsService: NewsService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCategories();
      this.loadNews();

      // Escuchar cambios de parámetro :id para deep linking
      const routeSub = this.route.paramMap.subscribe((params) => {
        const id = params.get('id');
        if (id) {
          this.openDetailById(id);
        } else {
          this.selectedArticle = null;
        }
      });
      this.subs.push(routeSub);

      // Debounce en búsqueda por texto
      const searchSub = this.searchSubject
        .pipe(debounceTime(300), distinctUntilChanged())
        .subscribe((term) => {
          this.searchQuery = term;
          this.pagination.page = 1;
          this.loadNews();
        });
      this.subs.push(searchSub);
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  loadCategories(): void {
    this.newsService.getCategories().subscribe({
      next: (res) => {
        this.categories = res.categories;
      },
      error: () => {
        // Fallback silencioso
      },
    });
  }

  loadNews(): void {
    this.isLoading = true;
    this.errorMessage = '';

    if (this.onlyFavorites) {
      this.newsService
        .getFavorites({
          category: this.selectedCategory,
          q: this.searchQuery,
          page: this.pagination.page,
          limit: this.pagination.limit,
        })
        .subscribe({
          next: (res) => {
            this.articles = res.news;
            this.pagination = res.pagination;
            this.isLoading = false;
          },
          error: (err) => {
            this.errorMessage = 'No se pudieron cargar las noticias favoritas. Intenta nuevamente.';
            this.isLoading = false;
          },
        });
    } else if (this.sortOption === 'relevance') {
      this.newsService
        .getRelevant({
          category: this.selectedCategory,
          q: this.searchQuery,
          page: this.pagination.page,
          limit: this.pagination.limit,
        })
        .subscribe({
          next: (res) => {
            this.articles = res.news;
            this.pagination = res.pagination;
            this.isLoading = false;
          },
          error: (err) => {
            this.errorMessage = 'No se pudieron cargar las noticias recomendadas. Intenta nuevamente.';
            this.isLoading = false;
          },
        });
    } else {
      this.newsService
        .getNews({
          category: this.selectedCategory,
          q: this.searchQuery,
          sort: 'recent',
          page: this.pagination.page,
          limit: this.pagination.limit,
        })
        .subscribe({
          next: (res) => {
            this.articles = res.news;
            this.pagination = res.pagination;
            this.isLoading = false;
          },
          error: (err) => {
            this.errorMessage = 'No se pudieron cargar las noticias de mercado. Intenta nuevamente.';
            this.isLoading = false;
          },
        });
    }
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchSubject.next(input.value);
  }

  selectCategory(cat: NewsCategory | ''): void {
    if (this.selectedCategory === cat) return;
    this.selectedCategory = cat;
    this.pagination.page = 1;
    this.loadNews();
  }

  setSortOption(sort: 'recent' | 'relevance'): void {
    if (this.sortOption === sort) return;
    this.sortOption = sort;
    this.pagination.page = 1;
    this.loadNews();
  }

  toggleFavoritesOnly(): void {
    this.onlyFavorites = !this.onlyFavorites;
    this.pagination.page = 1;
    this.loadNews();
  }

  clearFilters(): void {
    this.selectedCategory = '';
    this.searchQuery = '';
    this.sortOption = 'recent';
    this.onlyFavorites = false;
    this.pagination.page = 1;
    this.loadNews();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.pagination.totalPages || page === this.pagination.page) return;
    this.pagination.page = page;
    this.loadNews();
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  openDetail(article: NewsArticle): void {
    this.selectedArticle = article;
    this.router.navigate(['/noticias', article.id], { replaceUrl: false });
  }

  openDetailById(id: string): void {
    // Si ya lo tenemos en la lista en memoria, úsalo de inmediato
    const found = this.articles.find((a) => a.id === id);
    if (found) {
      this.selectedArticle = found;
      return;
    }

    this.isLoadingDetail = true;
    this.detailErrorMessage = '';

    this.newsService.getArticle(id).subscribe({
      next: (res) => {
        this.selectedArticle = res.article;
        this.isLoadingDetail = false;
      },
      error: () => {
        this.isLoadingDetail = false;
        this.detailErrorMessage = 'La noticia solicitada no fue encontrada o ya no está disponible.';
        // Redirigir a /noticias tras advertencia
        setTimeout(() => {
          this.router.navigate(['/noticias']);
          this.detailErrorMessage = '';
        }, 3000);
      },
    });
  }

  closeDetail(): void {
    this.selectedArticle = null;
    this.router.navigate(['/noticias']);
  }

  onToggleFavorite(article: NewsArticle): void {
    if (article.isFavorite) {
      this.newsService.removeFavorite(article.id).subscribe({
        next: (res) => {
          article.isFavorite = false;
          article.favoriteCount = res.favoriteCount;
          if (this.onlyFavorites) {
            this.articles = this.articles.filter((a) => a.id !== article.id);
            this.pagination.total = Math.max(0, this.pagination.total - 1);
          }
        },
        error: () => {
          // Revertir optimismo si aplica
        },
      });
    } else {
      this.newsService.addFavorite(article.id).subscribe({
        next: (res) => {
          article.isFavorite = true;
          article.favoriteCount = res.favoriteCount;
        },
        error: () => {
          // Revertir optimismo si aplica
        },
      });
    }
  }

  getCategoryCount(cat: NewsCategory): number {
    const item = this.categories.find((c) => c.category === cat);
    return item?.count ?? 0;
  }

  getTotalCount(): number {
    return this.categories.reduce((acc, c) => acc + c.count, 0);
  }
}
