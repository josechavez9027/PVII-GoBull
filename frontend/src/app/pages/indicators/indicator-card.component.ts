import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IndicatorItem } from '../../core/services/indicators.service';

@Component({
  selector: 'app-indicator-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './indicator-card.component.html',
  styleUrl: './indicator-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorCardComponent {
  item = input.required<IndicatorItem>();
  /** Resalta la tarjeta como indicador activo del grafico. */
  selected = input<boolean>(false);
  /** Se emite al pulsar la tarjeta (clic, Enter o Espacio). */
  picked = output<void>();

  onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.picked.emit();
  }

  readonly valueLabel = computed(() => {
    const item = this.item();
    if (item.value === null || item.value === undefined) return '-';
    const formatted = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: item.decimals,
      maximumFractionDigits: item.decimals,
    }).format(item.value);
    if (item.unit === 'pct') return `${formatted}%`;
    if (item.unit === 'usd') return `$${formatted}`;
    return formatted;
  });

  readonly changeLabel = computed(() => {
    const change = this.item().changePct;
    if (change === null || change === undefined || !Number.isFinite(change)) return null;
    const sign = change > 0 ? '\u25B2 +' : change < 0 ? '\u25BC ' : '';
    return `${sign}${this.formatPct(change)}%`;
  });

  readonly trend = computed<'up' | 'down' | 'flat'>(() => {
    const change = this.item().changePct;
    if (!change || !Number.isFinite(change)) return 'flat';
    return change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  });

  readonly updatedLabel = computed(() => {
    const asOf = this.item().asOf;
    if (!asOf) return 'sin datos';
    const timestamp = new Date(asOf).getTime();
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `hace ${days} d`;
  });

  private formatPct(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
