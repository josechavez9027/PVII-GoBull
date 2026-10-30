import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import {
  HistoryResponse,
  IndicatorGroup,
  IndicatorItem,
  IndicatorsService,
  LiveRange,
} from '../../core/services/indicators.service';
import { IndicatorCardComponent } from './indicator-card.component';
import { IndicatorLiveChartComponent, isIntradayRange } from './indicator-live-chart.component';

export interface LiveGroup extends IndicatorGroup {
  label: string;
}

export const LIVE_RANGES: { value: LiveRange; label: string; hint: string }[] = [
  { value: '5MIN', label: '5 min', hint: 'Puntos de 5 minutos, ultimas 24 horas' },
  { value: '1HR', label: '1 h', hint: 'Puntos de 1 hora, ultimos 5 dias' },
  { value: '1W', label: '1 sem', hint: 'Cierres diarios, ultima semana' },
  { value: '1M', label: '1 mes', hint: 'Cierres diarios, ultimo mes' },
  { value: '1Y', label: '1 año', hint: 'Cierres diarios, último año' },
  { value: '2Y', label: '2 años', hint: 'Cierres diarios, últimos 2 años' },
];

const LIVE_TAB_ORDER_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];

interface Request {
  code: string;
  range: LiveRange;
}

@Component({
  selector: 'app-indicator-live',
  standalone: true,
  imports: [IndicatorCardComponent, IndicatorLiveChartComponent],
  templateUrl: './indicator-live.component.html',
  styleUrl: './indicator-live.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorLiveComponent {
  groups = input.required<LiveGroup[]>();
  /** Cambia con cada refresco del panel para volver a pedir la serie. */
  refreshKey = input<string>('');

  readonly ranges = LIVE_RANGES;

  private indicatorsService = inject(IndicatorsService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private requests = new Subject<Request>();

  readonly selectedCategory = signal<string | null>(null);
  readonly selectedCode = signal<string | null>(null);
  readonly range = signal<LiveRange>('1M');
  readonly history = signal<HistoryResponse | null>(null);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  readonly activeGroup = computed<LiveGroup | null>(() => {
    const groups = this.groups();
    return groups.find((g) => g.category === this.selectedCategory()) ?? groups[0] ?? null;
  });

  readonly activeItem = computed<IndicatorItem | null>(() => {
    const group = this.activeGroup();
    if (!group) return null;
    return group.items.find((i) => i.code === this.selectedCode()) ?? group.items[0] ?? null;
  });

  /** Rango efectivo: los indicadores sin intradia caen a 1 mes. */
  readonly effectiveRange = computed<LiveRange>(() => {
    const item = this.activeItem();
    const range = this.range();
    return item && !item.intraday && isIntradayRange(range) ? '1M' : range;
  });

  readonly points = computed(() => this.history()?.points ?? []);

  readonly stats = computed(() => {
    const points = this.points();
    if (points.length < 2) return null;
    const values = points.map((p) => p.v);
    const first = values[0]!;
    const last = values[values.length - 1]!;
    const change = last - first;
    return {
      first,
      last,
      high: Math.max(...values),
      low: Math.min(...values),
      change,
      changePct: first !== 0 ? (change / Math.abs(first)) * 100 : null,
      count: values.length,
    };
  });

  readonly trend = computed<'up' | 'down' | 'flat'>(() => {
    const change = this.stats()?.change ?? 0;
    return change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  });

  readonly rangeHint = computed(
    () => LIVE_RANGES.find((r) => r.value === this.effectiveRange())?.hint ?? '',
  );

  readonly granularityNote = computed(() => {
    const history = this.history();
    if (!history || history.granularity !== 'intraday') return null;
    return `Datos propios de la plataforma, agrupados cada ${history.bucketMinutes} min. Se acumulan durante el horario de mercado.`;
  });

  constructor() {
    this.requests
      .pipe(
        switchMap((request) =>
          this.indicatorsService.getHistory(request.code, request.range).pipe(
            map((data) => ({ ok: true as const, data })),
            catchError(() => of({ ok: false as const })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.ok) {
          this.history.set(result.data);
          this.state.set('ready');
        } else {
          this.state.set('error');
        }
      });

    effect(() => {
      const item = this.activeItem();
      const range = this.effectiveRange();
      this.refreshKey();
      if (!item || !isPlatformBrowser(this.platformId)) return;
      this.requests.next({ code: item.code, range });
    });
  }

  selectCategory(category: string): void {
    if (category === this.activeGroup()?.category) return;
    this.selectedCategory.set(category);
    this.selectedCode.set(null);
    this.beginLoading();
  }

  selectItem(code: string): void {
    if (code === this.activeItem()?.code) return;
    this.selectedCode.set(code);
    this.beginLoading();
  }

  selectRange(range: LiveRange): void {
    if (range === this.range()) return;
    this.range.set(range);
    this.beginLoading();
  }

  retry(): void {
    const item = this.activeItem();
    if (!item) return;
    this.beginLoading();
    this.requests.next({ code: item.code, range: this.effectiveRange() });
  }

  rangeDisabled(range: LiveRange): boolean {
    const item = this.activeItem();
    return !!item && !item.intraday && isIntradayRange(range);
  }

  onCategoryKeydown(event: KeyboardEvent): void {
    if (!LIVE_TAB_ORDER_KEYS.includes(event.key)) return;
    const groups = this.groups();
    if (groups.length === 0) return;
    event.preventDefault();
    const current = groups.findIndex((g) => g.category === this.activeGroup()?.category);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % groups.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + groups.length) % groups.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = groups.length - 1;
    const target = groups[next]!;
    this.selectCategory(target.category);
    document.getElementById(`live-tab-${target.category}`)?.focus();
  }

  formatValue(value: number | null | undefined, item: IndicatorItem | null = this.activeItem()): string {
    if (value === null || value === undefined || !Number.isFinite(value) || !item) return '-';
    const formatted = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: item.decimals,
      maximumFractionDigits: item.decimals,
    }).format(value);
    if (item.unit === 'pct') return `${formatted}%`;
    if (item.unit === 'usd') return `$${formatted}`;
    return formatted;
  }

  formatPct(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '-';
    const formatted = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    }).format(value);
    return `${formatted}%`;
  }

  private beginLoading(): void {
    this.history.set(null);
    this.state.set('loading');
  }
}
