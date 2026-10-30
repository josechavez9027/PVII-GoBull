import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Chart as ChartJs } from 'chart.js';
import { HistoryRange, IndicatorPoint } from '../../core/services/indicators.service';

const FALLBACK_COLORS = { up: '#63a86b', down: '#d75b61', flat: '#159bd7', grid: '#e3e9ed' };

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', options);

const TICK_FORMATS: Record<string, Intl.DateTimeFormat> = {
  '5MIN': fmt({ hour: '2-digit', minute: '2-digit', hour12: false }),
  '1HR': fmt({ weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
  '1W': fmt({ weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
  '1M': fmt({ day: 'numeric', month: 'short', timeZone: 'UTC' }),
  '3M': fmt({ day: 'numeric', month: 'short', timeZone: 'UTC' }),
  '6M': fmt({ day: 'numeric', month: 'short', timeZone: 'UTC' }),
  '1Y': fmt({ month: 'short', year: '2-digit', timeZone: 'UTC' }),
  '2Y': fmt({ month: 'short', year: '2-digit', timeZone: 'UTC' }),
  '5Y': fmt({ month: 'short', year: 'numeric', timeZone: 'UTC' }),
};
const TOOLTIP_INTRADAY = fmt({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const TOOLTIP_DAILY = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function toDate(t: string): Date {
  return t.length <= 10 ? new Date(`${t}T00:00:00.000Z`) : new Date(t);
}

export function isIntradayRange(range: string): boolean {
  return range === '5MIN' || range === '1HR';
}

/** Grafico de linea con area, eje de tiempo (X), eje de precio (Y) y tooltip por punto. */
@Component({
  selector: 'app-indicator-live-chart',
  standalone: true,
  template:
    '<canvas #canvas role="img" [attr.aria-label]="label()"></canvas>',
  styles: [
    `
      :host {
        display: block;
        height: 380px;
        position: relative;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
      @media (max-width: 720px) {
        :host {
          height: 280px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorLiveChartComponent {
  points = input.required<IndicatorPoint[]>();
  range = input.required<HistoryRange>();
  decimals = input<number>(2);
  label = input<string>('Grafico del indicador');
  trend = input<'up' | 'down' | 'flat'>('flat');

  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private chart: ChartJs | null = null;
  private disposed = false;
  private rendering = 0;

  /** Estado leido por los callbacks de Chart.js (permite actualizar sin recrear). */
  private live = { range: '1M' as string, decimals: 2, times: [] as string[] };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disposed = true;
      this.chart?.destroy();
      this.chart = null;
    });

    effect(() => {
      const points = this.points();
      const range = this.range();
      const decimals = this.decimals();
      const trend = this.trend();
      if (!isPlatformBrowser(this.platformId)) return;
      void this.render(points, range, decimals, trend);
    });
  }

  private colorFor(trend: 'up' | 'down' | 'flat'): string {
    const token =
      trend === 'up'
        ? '--border-state-success'
        : trend === 'down'
          ? '--border-state-danger'
          : '--border-accent-blue';
    return cssVar(token, FALLBACK_COLORS[trend]);
  }

  private formatValue(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: this.live.decimals,
      maximumFractionDigits: this.live.decimals,
    }).format(value);
  }

  private async render(
    points: IndicatorPoint[],
    range: string,
    decimals: number,
    trend: 'up' | 'down' | 'flat',
  ): Promise<void> {
    const ticket = ++this.rendering;
    this.live.range = range;
    this.live.decimals = decimals;
    this.live.times = points.map((p) => p.t);

    const color = this.colorFor(trend);
    const labels = points.map((p) => p.t);
    const values = points.map((p) => p.v);

    if (this.chart) {
      const dataset = this.chart.data.datasets[0]!;
      this.chart.data.labels = labels;
      dataset.data = values;
      dataset.borderColor = color;
      dataset.backgroundColor = withAlpha(color, 0.14);
      this.chart.update('none');
      return;
    }

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas().nativeElement.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    let Chart: typeof ChartJs;
    try {
      Chart = (await import('chart.js/auto')).default as unknown as typeof ChartJs;
    } catch {
      return;
    }
    if (this.disposed || ticket !== this.rendering || this.chart) return;

    const grid = cssVar('--border-subtle', FALLBACK_COLORS.grid);
    const text = cssVar('--text-muted', '#71808c');
    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.chart = new Chart(this.canvas().nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: color,
            backgroundColor: withAlpha(color, 0.14),
            borderWidth: 2,
            fill: 'origin',
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: cssVar('--bg-surface', '#ffffff'),
            pointHoverBorderWidth: 2,
            tension: 0.15,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion ? false : { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8, right: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            padding: 10,
            callbacks: {
              title: (items) => {
                const t = this.live.times[items[0]?.dataIndex ?? 0];
                if (!t) return '';
                const formatter = isIntradayRange(this.live.range)
                  ? TOOLTIP_INTRADAY
                  : TOOLTIP_DAILY;
                return formatter.format(toDate(t));
              },
              label: (item) => this.formatValue(Number(item.parsed.y)),
            },
          },
        },
        scales: {
          x: {
            grid: { color: grid, drawTicks: false },
            border: { color: grid },
            ticks: {
              color: text,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 7,
              padding: 8,
              font: { size: 11 },
              callback: (_value, index) => {
                const t = this.live.times[index];
                const formatter = TICK_FORMATS[this.live.range] ?? TICK_FORMATS['1M']!;
                return t ? formatter.format(toDate(t)) : '';
              },
            },
          },
          y: {
            position: 'right',
            grace: '8%',
            grid: { color: grid, drawTicks: false },
            border: { display: false },
            ticks: {
              color: text,
              padding: 8,
              maxTicksLimit: 6,
              font: { size: 11 },
              callback: (value) => this.formatValue(Number(value)),
            },
          },
        },
      },
    });
  }
}
