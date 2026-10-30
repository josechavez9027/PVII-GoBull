import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subject, Subscription, catchError, map, of, switchMap, takeUntil, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IndicatorsService } from '../../core/services/indicators.service';
import {
  CompareResponse,
  IndicatorGroup,
  IndicatorItem,
  IndicatorRange,
  IndicatorsPanel,
} from '../../core/services/indicators.service';
import { IndicatorLiveComponent } from './indicator-live.component';
import { ChartSeries, IndicatorChartComponent } from './indicator-chart.component';
import { IndicatorCompareTableComponent } from './indicator-compare-table.component';

const RANGE_OPTIONS: IndicatorRange[] = ['1M', '3M', '6M', '1Y', '5Y'];
const TAB_ORDER = ['live', 'history'] as const;
const SKELETON_SLOTS = Array.from({ length: 8 }, (_, index) => index);

const CATEGORY_LABELS: Record<string, string> = {
  VOLATILITY: 'Volatilidad',
  DOLLAR: 'Dolar',
  RATES: 'Bonos del Tesoro',
  EQUITY: 'Bolsa US',
  COMMODITY: 'Materias primas',
  CRYPTO: 'Cripto',
  FOREX: 'Divisas',
  MACRO: 'Macro',
};

export interface LabeledIndicatorGroup extends IndicatorGroup {
  label: string;
}

@Component({
  selector: 'app-indicators',
  standalone: true,
  imports: [
    CommonModule,
    IndicatorLiveComponent,
    IndicatorChartComponent,
    IndicatorCompareTableComponent,
  ],
  templateUrl: './indicators.component.html',
  styleUrl: './indicators.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorsComponent implements OnInit, OnDestroy {
  readonly rangeOptions = RANGE_OPTIONS;
  readonly skeletonSlots = SKELETON_SLOTS;

  readonly activeTab = signal<'live' | 'history'>('live');
  readonly panel = signal<IndicatorsPanel | null>(null);
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly range = signal<IndicatorRange>('1Y');
  readonly selectedCodes = signal<string[]>(['VIX', 'DXY', 'US10Y']);
  readonly compare = signal<CompareResponse | null>(null);
  readonly compareState = signal<'loading' | 'ready' | 'error'>('loading');

  readonly configured = computed(() => this.panel()?.configured ?? true);

  readonly visibleGroups = computed<LabeledIndicatorGroup[]>(() => {
    const groups: IndicatorGroup[] = [];
    // Dolar tiene un solo indicador: se muestra dentro de Bolsa US.
    for (const group of this.panel()?.groups ?? []) {
      if (group.items.length === 0) continue;
      const category = group.category === 'DOLLAR' ? 'EQUITY' : group.category;
      const target = groups.find((g) => g.category === category);
      if (target) {
        target.items = [...target.items, ...group.items];
      } else {
        groups.push({ category, items: [...group.items] });
      }
    }
    return groups.map((group) => ({
      ...group,
      label: CATEGORY_LABELS[group.category] ?? group.category,
    }));
  });
  readonly allItems = computed<IndicatorItem[]>(() =>
    (this.panel()?.groups ?? []).flatMap((group) => group.items),
  );

  readonly panelEmpty = computed(
    () =>
      this.loadState() === 'ready' &&
      this.allItems().every((item) => item.status === 'unavailable'),
  );

  readonly selectIndicators = computed<IndicatorItem[]>(() =>
    this.allItems().filter((item) => item.status !== 'unavailable'),
  );

  readonly chartSeries = computed<ChartSeries[]>(() => {
    const compareData = this.compare();
    if (!compareData) return [];
    return compareData.series.map((serie) => ({
      code: serie.code,
      label: serie.name,
      points: serie.base100,
    }));
  });

  private destroyRef = inject(DestroyRef);
  private indicatorsService = inject(IndicatorsService);
  private platformId = inject(PLATFORM_ID);
  private pollingSub: Subscription | null = null;
  private panelSub: Subscription | null = null;
  private stopPolling = new Subject<void>();
  private compareRequest = new Subject<void>();
  private visibilityHandler = this.handleVisibility.bind(this);

  constructor() {
    this.compareRequest
      .pipe(
        switchMap(() =>
          this.indicatorsService.getCompare(this.selectedCodes(), this.range()).pipe(
            catchError(() => of(null)),
            map((data) => data as CompareResponse | null),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((data) => {
        if (data) {
          this.compare.set(data);
          this.compareState.set('ready');
        } else {
          this.compareState.set('error');
        }
      });
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.startPolling();
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    });
    this.loadCompare();
  }

  ngOnDestroy(): void {
    this.stopPolling.next();
    this.stopPolling.complete();
    this.pollingSub?.unsubscribe();
    this.panelSub?.unsubscribe();
  }

  setTab(tab: 'live' | 'history'): void {
    if (tab === this.activeTab()) {
      if (tab === 'history') this.loadCompare();
      return;
    }
    this.activeTab.set(tab);
    if (tab === 'history') {
      this.loadCompare();
    }
  }

  onTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const current = TAB_ORDER.indexOf(this.activeTab());
    const delta = event.key === 'ArrowRight' ? 1 : TAB_ORDER.length - 1;
    const next = TAB_ORDER[(current + delta) % TAB_ORDER.length]!;
    this.setTab(next);
    const target = document.getElementById(`tab-${next}`);
    target?.focus();
  }

  setRange(range: string): void {
    if (range === this.range()) return;
    this.range.set(range as IndicatorRange);
    this.loadCompare();
  }

  toggleCode(code: string): void {
    const current = this.selectedCodes();
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code].slice(0, 6);
    if (next.length === 0) return;
    this.selectedCodes.set(next);
    this.loadCompare();
  }

  isSelected(code: string): boolean {
    return this.selectedCodes().includes(code);
  }

  retry(): void {
    this.pausePolling();
    this.startPolling();
  }

  retryCompare(): void {
    this.loadCompare();
  }

  formatAsOf(asOf: string | null): string {
    if (!asOf) return 'sin datos';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(asOf).getTime()) / 60000));
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return new Date(asOf).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
  }

  trackGroup(_: number, group: IndicatorGroup): string {
    return group.category;
  }

  trackItem(_: number, item: IndicatorItem): string {
    return item.code;
  }

  private handleVisibility(): void {
    if (document.visibilityState === 'hidden') {
      this.pausePolling();
    } else {
      this.startPolling();
    }
  }

  private pausePolling(): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = null;
    this.panelSub?.unsubscribe();
    this.panelSub = null;
  }

  private startPolling(): void {
    if (this.pollingSub) return;
    this.pollingSub = timer(60_000, 60_000)
      .pipe(
        switchMap(() => this.fetchPanel()),
        takeUntil(this.stopPolling),
      )
      .subscribe((panel) => this.applyPanel(panel));
    this.loadPanel();
  }

  private loadPanel(): void {
    if (!this.panel()) this.loadState.set('loading');
    this.panelSub?.unsubscribe();
    this.panelSub = this.fetchPanel()
      .pipe(takeUntil(this.stopPolling), takeUntilDestroyed(this.destroyRef))
      .subscribe((panel) => this.applyPanel(panel));
  }

  private fetchPanel() {
    return this.indicatorsService.getPanel().pipe(
      catchError(() => {
        this.loadState.set('error');
        return of(null);
      }),
    );
  }

  private applyPanel(panel: IndicatorsPanel | null): void {
    if (!panel) return;
    this.loadState.set('ready');
    this.panel.set(panel);
  }

  private loadCompare(): void {
    if (this.activeTab() !== 'history') return;
    if (this.selectedCodes().length === 0) return;
    this.compareState.set('loading');
    this.compareRequest.next();
  }
}
