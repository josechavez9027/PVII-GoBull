import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Context } from 'chartjs-plugin-datalabels';
import { FuturesItem, FuturesPeriod } from '../../core/services/futures.service';

interface ChartInstance {
  destroy(): void;
}

interface BarRow {
  name: string;
  changePct: number;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Convierte un color hex de 6 digitos a rgba con la opacidad indicada. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return `rgba(32, 44, 56, ${alpha})`;
  const hex = match[1]!;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

@Component({
  selector: 'app-futures-bar-chart',
  standalone: true,
  host: { '[style.height.px]': 'height()' },
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuturesBarChartComponent {
  items = input.required<FuturesItem[]>();
  period = input<FuturesPeriod>('1D');

  readonly height = computed(() => Math.max(240, this.items().length * 30 + 48));

  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private chartInstance: ChartInstance | null = null;
  private lastSignature = '';
  private disposed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.disposed = true;
      this.destroyChart();
    });

    effect(() => {
      const items = this.items();
      const period = this.period();
      if (!isPlatformBrowser(this.platformId)) return;
      void this.render(items, period);
    });
  }

  private rows(items: FuturesItem[], period: FuturesPeriod): BarRow[] {
    return items
      .map((item) => ({ item, change: item.changes[period] }))
      .filter(
        (row): row is { item: FuturesItem; change: number } =>
          row.item.available && row.change !== null && Number.isFinite(row.change),
      )
      .map((row) => ({ name: row.item.name, changePct: row.change }));
  }

  private signature(rows: BarRow[], period: FuturesPeriod): string {
    return `${period}|${rows.map((row) => `${row.name}:${row.changePct.toFixed(3)}`).join('|')}`;
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private async render(items: FuturesItem[], period: FuturesPeriod): Promise<void> {
    const rows = this.rows(items, period);
    if (rows.length === 0) {
      this.destroyChart();
      this.lastSignature = '';
      return;
    }
    const signature = this.signature(rows, period);
    if (signature === this.lastSignature && this.chartInstance) return;
    this.lastSignature = signature;

    const canvas = this.canvas().nativeElement;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!context) return;

    let ChartModule: typeof import('chart.js/auto');
    try {
      ChartModule = await import('chart.js/auto');
    } catch {
      return;
    }
    if (this.disposed) return;
    const Chart = ChartModule.default;

    let Datalabels: typeof import('chartjs-plugin-datalabels').default;
    try {
      Datalabels = (await import('chartjs-plugin-datalabels')).default;
    } catch {
      return;
    }
    if (this.disposed) return;

    this.destroyChart();

    const success = cssVar('--border-state-success', '#63a86b');
    const danger = cssVar('--border-state-danger', '#d75b61');
    const info = cssVar('--border-accent-blue', '#159bd7');
    const grid = cssVar('--border-subtle', '#e3e9ed');
    const text = cssVar('--text-secondary', '#576670');
    const ink = cssVar('--text-primary', '#202c38');

    const toneFor = (value: number): string => (value > 0 ? success : value < 0 ? danger : info);
    let hoveredIndex = -1;
    const isActive = (context: Context): boolean =>
      context.active || context.dataIndex === hoveredIndex;

    try {
      this.chartInstance = new Chart(canvas, {
        type: 'bar',
        plugins: [Datalabels],
        data: {
          labels: rows.map((row) => row.name),
          datasets: [
            {
              label: 'Cambio',
              data: rows.map((row) => row.changePct),
              backgroundColor: rows.map((row) =>
                row.changePct > 0 ? success : row.changePct < 0 ? danger : info,
              ),
              borderRadius: 4,
              barThickness: 14,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: { padding: { left: 48, right: 48 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context: { parsed: { x: number | null } }) => {
                  const value = context.parsed.x;
                  if (value === null) return 'Sin dato';
                  const sign = value > 0 ? '+' : '';
                  return `${sign}${value.toFixed(2)}%`;
                },
              },
            },
            datalabels: {
              anchor: (context: Context) =>
                Number(context.dataset.data[context.dataIndex]) >= 0 ? 'end' : 'start',
              align: (context: Context) =>
                Number(context.dataset.data[context.dataIndex]) >= 0 ? 'right' : 'left',
              offset: 8,
              clamp: true,
              clip: false,
              display: (context: Context) =>
                Number.isFinite(Number(context.dataset.data[context.dataIndex])),
              formatter: (value: unknown) => {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) return '';
                const sign = numeric > 0 ? '+' : '';
                return `${sign}${numeric.toFixed(2)}%`;
              },
              color: (context: Context) => {
                const value = Number(context.dataset.data[context.dataIndex]);
                return isActive(context) ? '#ffffff' : toneFor(value);
              },
              backgroundColor: (context: Context) =>
                isActive(context) ? withAlpha(ink, 1) : withAlpha(ink, 0.1),
              borderColor: (context: Context) => {
                const value = Number(context.dataset.data[context.dataIndex]);
                return isActive(context) ? toneFor(value) : withAlpha(ink, 0.18);
              },
              borderWidth: 1,
              borderRadius: 4,
              padding: { top: 2, bottom: 2, left: 6, right: 6 },
              font: { size: 11, weight: 600 },
              listeners: {
                enter: (context: Context) => {
                  hoveredIndex = context.dataIndex;
                  return true;
                },
                leave: (context: Context) => {
                  if (hoveredIndex === context.dataIndex) hoveredIndex = -1;
                  return true;
                },
              },
            },
          },
          scales: {
            x: {
              grace: 2,
              grid: { color: grid },
              ticks: {
                color: text,
                callback: (value: string | number) => `${Number(value).toFixed(0)}%`,
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: text, autoSkip: false, font: { size: 11 } },
            },
          },
        },
      });
    } catch {
      this.chartInstance = null;
    }
  }
}
