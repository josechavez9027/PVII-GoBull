import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsArticle, NewsService } from '../../core/services/news.service';

@Component({
  selector: 'app-news-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news-detail.component.html',
  styleUrl: './news-detail.component.css',
})
export class NewsDetailComponent implements OnInit {
  @Input({ required: true }) article!: NewsArticle;
  @Output() close = new EventEmitter<void>();
  @Output() toggleFavorite = new EventEmitter<NewsArticle>();

  imageError = false;

  constructor(private newsService: NewsService) {}

  ngOnInit(): void {
    if (this.article?.id) {
      // Registrar vista en backend
      this.newsService.recordView(this.article.id).subscribe({
        next: (res) => {
          if (res.viewed) {
            this.article.viewCount = res.viewCount;
          }
        },
        error: () => {
          // Ignorar fallo de registro de vista sin romper UI
        },
      });
    }
  }

  onImageError(): void {
    this.imageError = true;
  }

  getSentimentLabel(sentiment: number | null): string {
    if (sentiment === null || sentiment === undefined) return 'Neutro';
    if (sentiment > 0.1) return 'Positivo';
    if (sentiment < -0.1) return 'Negativo';
    return 'Neutro';
  }

  getSentimentClass(sentiment: number | null): string {
    if (sentiment === null || sentiment === undefined) return 'sentiment--neutral';
    if (sentiment > 0.1) return 'sentiment--positive';
    if (sentiment < -0.1) return 'sentiment--negative';
    return 'sentiment--neutral';
  }

  getRelativeTime(dateString: string): string {
    try {
      const now = Date.now();
      const published = new Date(dateString).getTime();
      const diffMs = now - published;
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) return 'ahora';
      if (diffMinutes < 60) return `hace ${diffMinutes} min`;
      if (diffHours < 24) return `hace ${diffHours} h`;
      if (diffDays === 1) return 'hace 1 día';
      if (diffDays < 30) return `hace ${diffDays} días`;
      return new Date(dateString).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  onFavoriteClick(): void {
    this.toggleFavorite.emit(this.article);
  }
}
