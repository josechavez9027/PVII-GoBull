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
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IndicatorPoint } from '../../core/services/indicators.service';

export interface ChartSeries {
  code: string;
  label: string;
  points: IndicatorPoint[];
  color?: string;
}

interface ChartInstance {
  destroy(): void;
}

const TOKEN_COLORS: Array<[string, string]> = [
  ['--border-primary', '#087dc9'],
  ['--brand-bull', '#3ab576'],
  ['--border-state-danger', '#d75b61'],
  ['--border-state-warning', '#d99c26'],
  ['--border-accent-blue', '#159bd7'],
  ['--text-secondary', '#576670'],
];

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

@Component({
  selector: 'app-indicator-chart',
  standalone: true,
  imports: [CommonModule],
  template: '<canvas #canvas></canvas>',
  styles: [
    `
      :host {
        display: block;
        height: 320px;
      }
      canvas {
        width: 100% !important;
        height: 100% !important;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorChartComponent {
  series = input.required<ChartSeries[]>();

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
      const data = this.series();
      if (!isPlatformBrowser(this.platformId)) return;
      void this.render(data);
    });
  }

  private normalizePoints(points: IndicatorPoint[]): IndicatorPoint[] {
    const filtered = points.filter((point) => Number.isFinite(point.v));
    const seen = new Set<string>();
    const unique: IndicatorPoint[] = [];
    for (const point of filtered) {
      if (!seen.has(point.t)) {
        seen.add(point.t);
        unique.push(point);
      }
    }
    return unique;
  }

  private signature(data: ChartSeries[]): string {
    return data
      .map(
        (serie) =>
          `${serie.code}:${serie.points.length}:${serie.points[0]?.t ?? ''}:${serie.points[serie.points.length - 1]?.v ?? ''}`,
      )
      .join('|');
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private async render(data: ChartSeries[]): Promise<void> {
    if (data.length === 0) {
      this.destroyChart();
      return;
    }
    const signature = this.signature(data);
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

    this.destroyChart();

    const dates = new Set<string>();
    for (const serie of data) {
      for (const point of this.normalizePoints(serie.points)) dates.add(point.t);
    }
    const labels = [...dates].sort();
    const palette = TOKEN_COLORS.map(([name, fallback]) => cssVar(name, fallback));

    const rows = data.map((serie, index) => {
      const byDate = new Map(this.normalizePoints(serie.points).map((p) => [p.t, p.v]));
      return {
        label: serie.label,
        color: serie.color ?? palette[index % palette.length] ?? palette[0]!,
        values: labels.map((t) => (byDate.has(t) ? byDate.get(t)! : null)),
      };
    });

    try {
      this.chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: rows.map((row) => ({
            label: row.label,
            data: row.values,
            borderColor: row.color,
            backgroundColor: row.color,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            spanGaps: true,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
            tooltip: {
              callbacks: {
                label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) =>
                  `${context.dataset.label ?? ''}: ${context.parsed.y?.toFixed(2) ?? '-'}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { maxTicksLimit: 8, maxRotation: 0 },
              grid: { display: false },
            },
            y: {
              ticks: { callback: (value: string | number) => Number(value).toFixed(2) },
            },
          },
        },
      });
    } catch {
      this.chartInstance = null;
    }
  }
}
