import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FUTURES_CATEGORY_LABELS,
  FUTURES_PERIODS,
  FuturesCategory,
  FuturesItem,
  FuturesPanel,
  FuturesPeriod,
} from '../../core/services/futures.service';
import { FuturesBarChartComponent } from './futures-bar-chart.component';

type SortKey = FuturesPeriod | 'code' | 'price';
type SortDir = 'asc' | 'desc';

const CATEGORY_ORDER: FuturesCategory[] = [
  'RATES',
  'CURRENCIES',
  'METALS',
  'SOFTS',
  'ENERGY',
  'INDICES',
  'GRAINS',
];

@Component({
  selector: 'app-futures-panel',
  standalone: true,
  imports: [FuturesBarChartComponent],
  templateUrl: './futures-panel.component.html',
  styleUrl: './futures-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuturesPanelComponent {
  panel = input<FuturesPanel | null>(null);
  state = input<'loading' | 'ready' | 'error'>('loading');

  retry = output<void>();

  readonly periods = FUTURES_PERIODS;
  readonly selectedCategory = signal<'ALL' | FuturesCategory>('ALL');
  readonly sortKey = signal<SortKey>('1D');
  readonly sortDir = signal<SortDir>('desc');
  readonly focusPeriod = signal<FuturesPeriod>('1D');

  readonly categories = computed<FuturesCategory[]>(() => {
    const seen = new Set<FuturesCategory>();
    for (const item of this.panel()?.items ?? []) seen.add(item.category);
    return CATEGORY_ORDER.filter((category) => seen.has(category));
  });

  readonly filteredItems = computed<FuturesItem[]>(() => {
    const category = this.selectedCategory();
    const items = this.panel()?.items ?? [];
    if (category === 'ALL') return items;
    return items.filter((item) => item.category === category);
  });

  readonly sortedItems = computed<FuturesItem[]>(() => {
    const key = this.sortKey();
    const direction = this.sortDir() === 'asc' ? 1 : -1;
    const value = (item: FuturesItem): number | null =>
      key === 'price' ? item.price : key === 'code' ? null : item.changes[key];

    return [...this.filteredItems()].sort((a, b) => {
      if (key === 'code') return a.code.localeCompare(b.code) * direction;
      const left = value(a);
      const right = value(b);
      if (left === null && right === null) return a.code.localeCompare(b.code);
      if (left === null) return 1;
      if (right === null) return -1;
      if (left === right) return a.code.localeCompare(b.code);
      return (left - right) * direction;
    });
  });

  readonly availableCount = computed(
    () => this.filteredItems().filter((item) => item.available).length,
  );

  readonly ranked = computed<FuturesItem[]>(() => {
    const period = this.focusPeriod();
    return this.filteredItems().filter((item) => item.changes[period] !== null);
  });

  readonly leader = computed<FuturesItem | null>(() => this.extreme('max'));

  readonly laggard = computed<FuturesItem | null>(() => this.extreme('min'));

  readonly chartItems = computed<FuturesItem[]>(() => {
    const period = this.focusPeriod();
    const items = this.filteredItems()
      .filter((item) => item.available && item.changes[period] !== null)
      .sort((a, b) => (b.changes[period] ?? 0) - (a.changes[period] ?? 0));
    if (this.selectedCategory() !== 'ALL' || items.length <= 20) return items;
    return [...items.slice(0, 10), ...items.slice(-10)];
  });

  readonly chartCaption = computed(() => {
    const period = this.focusPeriod();
  });

  readonly focusLabel = computed(() => this.focusPeriod());

  readonly updatedLabel = computed(() => {
    const panel = this.panel();
    return panel ? this.formatDateTime(panel.generatedAt) : '';
  });

  categoryLabel(category: FuturesCategory): string {
    return FUTURES_CATEGORY_LABELS[category];
  }

  setCategory(category: 'ALL' | FuturesCategory): void {
    this.selectedCategory.set(category);
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'code' ? 'asc' : 'desc');
    }
    if (key !== 'code' && key !== 'price') this.focusPeriod.set(key);
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  sortGlyph(key: SortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  formatPrice(item: FuturesItem): string {
    if (!item.available || item.price === null || !Number.isFinite(item.price)) return 'Sin dato';
    const value = item.price.toLocaleString('es-MX', {
      minimumFractionDigits: item.decimals,
      maximumFractionDigits: item.decimals,
    });
    return `${value} ${item.unit}`;
  }

  formatChange(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'Sin dato';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  changeGlyph(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value === 0) return '→';
    return value > 0 ? '▲' : '▼';
  }

  changeTone(value: number | null): string {
    if (value === null || !Number.isFinite(value) || value === 0) return 'info';
    return value > 0 ? 'success' : 'danger';
  }

  private extreme(kind: 'max' | 'min'): FuturesItem | null {
    const period = this.focusPeriod();
    const ranked = this.ranked();
    if (ranked.length === 0) return null;
    return ranked.reduce((best, item) => {
      const current = item.changes[period]!;
      const previous = best.changes[period]!;
      return kind === 'max' ? (current > previous ? item : best) : current < previous ? item : best;
    });
  }

  private formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
