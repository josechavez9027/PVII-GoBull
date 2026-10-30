import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompareResponse } from '../../core/services/indicators.service';

@Component({
  selector: 'app-indicator-compare-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wrapper" data-testid="indicator-compare-table">
      <table>
        <caption>
          Comparativa del periodo seleccionado
        </caption>
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col">Variacion del periodo</th>
            <th scope="col">Puntos</th>
          </tr>
        </thead>
        <tbody>
          @for (row of compare().series; track row.code) {
            <tr>
              <th scope="row">{{ row.name }}</th>
              <td
                data-label="Variacion del periodo"
                [class.cell-up]="(row.changePeriodPct ?? 0) > 0"
                [class.cell-down]="(row.changePeriodPct ?? 0) < 0"
              >
                {{
                  row.changePeriodPct === null ? '-' : (row.changePeriodPct | number: '1.2-2') + '%'
                }}
              </td>
              <td data-label="Puntos">{{ row.base100.length }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="3" class="empty">Sin series suficientes para el rango seleccionado.</td>
            </tr>
          }
        </tbody>
      </table>
      @if (compare().missing.length > 0) {
        <p class="missing">Sin historico disponible para: {{ compare().missing.join(', ') }}.</p>
      }
    </div>
  `,
  styles: [
    `
      .wrapper {
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        min-width: 380px;
      }
      caption {
        text-align: left;
        font-weight: 600;
        color: var(--text-primary);
        padding: 12px 16px 6px;
      }
      th,
      td {
        padding: 9px 16px;
        text-align: left;
        border-top: 1px solid var(--border-subtle);
        font-variant-numeric: tabular-nums;
      }
      thead th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }
      td.cell-up {
        color: var(--border-state-success);
        font-weight: 600;
      }
      td.cell-down {
        color: var(--border-state-danger);
        font-weight: 600;
      }
      .empty {
        color: var(--text-muted);
        text-align: center;
      }
      .missing {
        margin: 0;
        padding: 8px 16px 10px;
        font-size: 11px;
        color: var(--border-state-warning);
      }

      @media (max-width: 640px) {
        table,
        tbody,
        tr,
        th,
        td {
          display: block;
          min-width: 0;
        }
        thead {
          display: none;
        }
        tr {
          border-top: 1px solid var(--border-subtle);
          padding: 8px 0;
        }
        tbody th {
          border-top: none;
          font-size: 14px;
          color: var(--text-primary);
        }
        td {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-top: none;
          padding: 4px 16px;
        }
        td::before {
          content: attr(data-label);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorCompareTableComponent {
  compare = input.required<CompareResponse>();
}
