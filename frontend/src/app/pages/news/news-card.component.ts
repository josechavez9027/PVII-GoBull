import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NewsArticle } from '../../core/services/news.service';

@Component({
  selector: 'app-news-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './news-card.component.html',
  styleUrl: './news-card.component.css',
})
export class NewsCardComponent {
  @Input({ required: true }) article!: NewsArticle;
  @Output() selectArticle = new EventEmitter<NewsArticle>();
  @Output() toggleFavorite = new EventEmitter<NewsArticle>();

  imageError = false;

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
      return new Date(dateString).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  }

  onFavoriteClick(event: MouseEvent): void {
    event.stopPropagation();
    this.toggleFavorite.emit(this.article);
  }
}
