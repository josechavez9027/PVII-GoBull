import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  AnalysisBias,
  AnalysisNewsLabel,
  AnalysisResponse,
  AnalysisRiskLevel,
  AnalysisSeverity,
  AnalysisStance,
} from '../../core/services/indicators.service';

const BIAS_LABELS: Record<AnalysisBias, string> = {
  alcista: 'Alcista',
  neutral: 'Neutral',
  bajista: 'Bajista',
};

const RISK_LABELS: Record<AnalysisRiskLevel, string> = {
  bajo: 'bajo',
  moderado: 'moderado',
  alto: 'alto',
  extremo: 'extremo',
};

const SEVERITY_LABELS: Record<AnalysisSeverity, string> = {
  info: 'Informativo',
  alerta: 'Alerta',
  critica: 'Crítico',
};

const STANCE_LABELS: Record<AnalysisStance, string> = {
  positivo: 'Positivo',
  neutral: 'Neutral',
  negativo: 'Negativo',
};

const NEWS_LABELS: Record<AnalysisNewsLabel, string> = {
  positivo: 'Positivo',
  neutral: 'Neutro',
  negativo: 'Negativo',
};

@Component({
  selector: 'app-indicator-analysis',
  standalone: true,
  templateUrl: './indicator-analysis.component.html',
  styleUrl: './indicator-analysis.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorAnalysisComponent {
  analysis = input<AnalysisResponse | null>(null);
  state = input<'loading' | 'ready' | 'error'>('loading');
  retry = output<void>();

  readonly biasLabel = computed(() => {
    const analysis = this.analysis();
    return analysis ? BIAS_LABELS[analysis.bias] : '';
  });

  readonly riskLabel = computed(() => {
    const analysis = this.analysis();
    return analysis ? RISK_LABELS[analysis.riskLevel] : '';
  });

  biasGlyph(): string {
    const bias = this.analysis()?.bias;
    if (bias === 'alcista') return '▲';
    if (bias === 'bajista') return '▼';
    return '→';
  }

  biasTone(): string {
    const bias = this.analysis()?.bias;
    if (bias === 'alcista') return 'success';
    if (bias === 'bajista') return 'danger';
    return 'info';
  }

  riskTone(): string {
    const risk = this.analysis()?.riskLevel;
    if (risk === 'bajo') return 'success';
    if (risk === 'alto') return 'warning';
    if (risk === 'extremo') return 'danger';
    return 'info';
  }

  severityLabel(severity: AnalysisSeverity): string {
    return SEVERITY_LABELS[severity];
  }

  severityTone(severity: AnalysisSeverity): string {
    if (severity === 'critica') return 'danger';
    if (severity === 'alerta') return 'warning';
    return 'info';
  }

  stanceLabel(stance: AnalysisStance): string {
    return STANCE_LABELS[stance];
  }

  stanceTone(stance: AnalysisStance): string {
    if (stance === 'positivo') return 'success';
    if (stance === 'negativo') return 'danger';
    return 'info';
  }

  newsLabel(label: AnalysisNewsLabel): string {
    return NEWS_LABELS[label];
  }

  newsTone(label: AnalysisNewsLabel): string {
    if (label === 'positivo') return 'success';
    if (label === 'negativo') return 'danger';
    return 'info';
  }

  sentimentTone(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'info';
    if (value > 0.1) return 'success';
    if (value < -0.1) return 'danger';
    return 'info';
  }

  sentimentLabel(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'Sin sentimiento';
    if (value > 0.1) return 'Positivo';
    if (value < -0.1) return 'Negativo';
    return 'Neutro';
  }

  formatAsOf(asOf: string): string {
    return new Date(asOf).toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  formatNewsDate(publishedAt: string): string {
    return new Date(publishedAt).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
    });
  }

  formatSentiment(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'sin sentimiento';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  }
}
