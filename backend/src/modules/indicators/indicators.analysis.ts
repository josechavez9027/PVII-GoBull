import type {
  AnalysisBias,
  AnalysisDto,
  AnalysisNewsDto,
  AnalysisNewsLabel,
  AnalysisRiskLevel,
  AnalysisSeverity,
  AnalysisSignalDto,
  AnalysisStance,
  IndicatorInterpretationDto,
} from "./indicators.types";

export const CURATED_ANALYSIS_CODES = [
  "VIX",
  "SPX",
  "DXY",
  "US10Y",
  "SPREAD_10Y2Y",
  "GOLD",
  "BTC",
  "EURUSD",
] as const;

export type CuratedAnalysisCode = (typeof CURATED_ANALYSIS_CODES)[number];

export const ANALYSIS_BIAS_THRESHOLD = 0.25;
export const ANALYSIS_NEWS_THRESHOLD = 0.1;
export const ANALYSIS_WEEK_DAYS = 7;

export const ANALYSIS_DISCLAIMER =
  "Análisis informativo generado automáticamente a partir de datos de mercado. No constituye asesoría financiera ni una recomendación de inversión.";

export interface AnalysisInputItem {
  code: string;
  name: string;
  value: number | null;
  /** Variación porcentual contra la lectura de hace siete días. */
  weeklyChangePct: number | null;
  decimals: number;
  unit: string;
  asOf: string | null;
}

export interface AnalysisNewsInput {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: number | null;
}

export interface AnalysisInput {
  generatedAt: string;
  items: AnalysisInputItem[];
  news: AnalysisNewsInput[];
}

export interface WeeklySnapshot {
  asOf: Date;
  value: number;
}

/**
 * Variacion porcentual entre el ultimo snapshot y el ultimo dato disponible
 * en o antes de `weekStart`. Devuelve null si no hay referencia semanal.
 */
export function computeWeeklyChangePct(
  rows: WeeklySnapshot[],
  weekStart: Date,
): number | null {
  const latest = rows[rows.length - 1];
  if (!latest || !Number.isFinite(latest.value)) return null;
  if (latest.asOf.getTime() < weekStart.getTime()) return null;

  let baseline: WeeklySnapshot | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue;
    if (row.asOf.getTime() <= weekStart.getTime()) baseline = row;
  }
  if (!baseline || baseline.value === 0) return null;
  return ((latest.value - baseline.value) / Math.abs(baseline.value)) * 100;
}

interface RuleOutcome {
  vote: number;
  weight: number;
  risk: number;
  signal?: AnalysisSignalDto;
  interpretation: IndicatorInterpretationDto;
}

const CURATED_NAMES: Record<CuratedAnalysisCode, string> = {
  VIX: "VIX",
  SPX: "S&P 500",
  DXY: "Dólar Index (aprox.)",
  US10Y: "US Treasury 10Y",
  SPREAD_10Y2Y: "Spread 10Y-2Y",
  GOLD: "Oro (GCUSD)",
  BTC: "Bitcoin",
  EURUSD: "EUR/USD",
};

const RISK_ORDER: AnalysisRiskLevel[] = ["bajo", "moderado", "alto", "extremo"];

const SEVERITY_ORDER: Record<AnalysisSeverity, number> = {
  info: 0,
  alerta: 1,
  critica: 2,
};

const WEEK_SUGGESTIONS: Record<AnalysisBias, string> = {
  alcista:
    "Para la próxima semana, el escenario base favorece la continuidad al alza si la volatilidad sigue contenida.",
  bajista:
    "Para la próxima semana, el escenario base apunta a una postura defensiva mientras la volatilidad no ceda.",
  neutral:
    "Para la próxima semana no hay una dirección dominante; el mercado podría seguir en rango hasta una nueva señal.",
};

function normalize(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function formatValue(value: number, decimals: number, unit: string): string {
  const formatted = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  if (unit === "pct") return `${formatted}%`;
  if (unit === "usd") return `$${formatted}`;
  return formatted;
}

function formatWeeklyChange(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return "sin variación semanal disponible";
  const formatted = new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(changePct);
  return `${formatted}% en la semana`;
}

function unavailable(code: string, name: string): RuleOutcome {
  return {
    vote: 0,
    weight: 0,
    risk: 0,
    interpretation: {
      code,
      name,
      stance: "neutral",
      text: "Sin datos suficientes para interpretar este indicador.",
    },
  };
}

function defineInterpretation(
  code: string,
  name: string,
  stance: AnalysisStance,
  text: string,
): IndicatorInterpretationDto {
  return { code, name, stance, text };
}

function vixOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.VIX;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("VIX", name);

  const changeText = formatWeeklyChange(item.weeklyChangePct);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (value >= 30) {
    return {
      vote: -1,
      weight: 3,
      risk: 3,
      signal: {
        code: "VIX",
        indicator: name,
        severity: "critica",
        title: "Volatilidad extrema",
        message: `VIX en ${valueText} (${changeText}): el mercado descuenta estrés y suele moverse con fuerza.`,
      },
      interpretation: defineInterpretation(
        "VIX",
        name,
        "negativo",
        `VIX en ${valueText} (${changeText}): volatilidad extrema, el mercado descuenta estrés.`,
      ),
    };
  }

  if (value >= 20) {
    return {
      vote: -0.6,
      weight: 3,
      risk: 2,
      signal: {
        code: "VIX",
        indicator: name,
        severity: "alerta",
        title: "Volatilidad elevada",
        message: `VIX en ${valueText} (${changeText}): el mercado opera en modo defensivo.`,
      },
      interpretation: defineInterpretation(
        "VIX",
        name,
        "negativo",
        `VIX en ${valueText} (${changeText}): volatilidad elevada, los inversores están en modo defensivo.`,
      ),
    };
  }

  if (value >= 12) {
    return {
      vote: 0,
      weight: 3,
      risk: 1,
      interpretation: defineInterpretation(
        "VIX",
        name,
        "neutral",
        `VIX en ${valueText} (${changeText}): volatilidad contenida dentro de un rango normal.`,
      ),
    };
  }

  return {
    vote: 0.4,
    weight: 3,
    risk: 0,
    signal: {
      code: "VIX",
      indicator: name,
      severity: "info",
      title: "Volatilidad muy baja",
      message: `VIX en ${valueText} (${changeText}): hay complacencia; conviene vigilar sorpresas.`,
    },
    interpretation: defineInterpretation(
      "VIX",
      name,
      "positivo",
      `VIX en ${valueText} (${changeText}): volatilidad muy baja, el mercado opera con calma aunque con riesgo de complacencia.`,
    ),
  };
}

function spxOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.SPX;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("SPX", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 2) {
    return {
      vote: 1,
      weight: 2,
      risk: 0,
      signal: {
        code: "SPX",
        indicator: name,
        severity: "info",
        title: "Semana alcista en bolsa",
        message: `El S&P 500 avanza ${changeText}: el apetito por acciones se mantiene.`,
      },
      interpretation: defineInterpretation(
        "SPX",
        name,
        "positivo",
        `S&P 500 en ${valueText} (${changeText}): impulso comprador sostenido en la semana.`,
      ),
    };
  }

  if (change !== null && change <= -2) {
    return {
      vote: -1,
      weight: 2,
      risk: 1,
      signal: {
        code: "SPX",
        indicator: name,
        severity: "alerta",
        title: "Semana de presión vendedora",
        message: `El S&P 500 cae ${changeText}: la bolsa estadounidense pierde tracción.`,
      },
      interpretation: defineInterpretation(
        "SPX",
        name,
        "negativo",
        `S&P 500 en ${valueText} (${changeText}): presión vendedora en la semana.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 2,
    risk: 0,
    interpretation: defineInterpretation(
      "SPX",
      name,
      "neutral",
      `S&P 500 en ${valueText} (${changeText}): sin una dirección dominante en la semana.`,
    ),
  };
}

function dxyOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.DXY;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("DXY", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 1) {
    return {
      vote: -0.5,
      weight: 2,
      risk: 1,
      signal: {
        code: "DXY",
        indicator: name,
        severity: "info",
        title: "Dólar fuerte en la semana",
        message: `El dólar sube ${changeText}: suele presionar materias primas y activos de riesgo.`,
      },
      interpretation: defineInterpretation(
        "DXY",
        name,
        "negativo",
        `Dólar Index en ${valueText} (${changeText}): el fortalecimiento del dólar resta apoyo a activos de riesgo.`,
      ),
    };
  }

  if (change !== null && change <= -1) {
    return {
      vote: 0.5,
      weight: 2,
      risk: 0,
      signal: {
        code: "DXY",
        indicator: name,
        severity: "info",
        title: "Dólar débil en la semana",
        message: `El dólar cede ${changeText}: alivia la presión sobre materias primas y mercados emergentes.`,
      },
      interpretation: defineInterpretation(
        "DXY",
        name,
        "positivo",
        `Dólar Index en ${valueText} (${changeText}): un dólar más débil favorece activos de riesgo.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 2,
    risk: 0,
    interpretation: defineInterpretation(
      "DXY",
      name,
      "neutral",
      `Dólar Index en ${valueText} (${changeText}): sin cambios relevantes en la semana.`,
    ),
  };
}

function treasuryOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.US10Y;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("US10Y", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 2.5) {
    return {
      vote: -0.5,
      weight: 1,
      risk: 1,
      signal: {
        code: "US10Y",
        indicator: name,
        severity: "alerta",
        title: "Rendimientos al alza",
        message: `El bono a 10 años sube a ${valueText} (${changeText}): las tasas altas presionan a las acciones.`,
      },
      interpretation: defineInterpretation(
        "US10Y",
        name,
        "negativo",
        `Bono a 10 años en ${valueText} (${changeText}): el alza de rendimientos encarece el financiamiento.`,
      ),
    };
  }

  if (change !== null && change <= -2.5) {
    return {
      vote: 0.5,
      weight: 1,
      risk: 0,
      signal: {
        code: "US10Y",
        indicator: name,
        severity: "info",
        title: "Rendimientos a la baja",
        message: `El bono a 10 años baja a ${valueText} (${changeText}): alivia la presión sobre las acciones.`,
      },
      interpretation: defineInterpretation(
        "US10Y",
        name,
        "positivo",
        `Bono a 10 años en ${valueText} (${changeText}): la caída de rendimientos suele favorecer a las acciones.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 1,
    risk: 0,
    interpretation: defineInterpretation(
      "US10Y",
      name,
      "neutral",
      `Bono a 10 años en ${valueText} (${changeText}): sin movimientos relevantes en la semana.`,
    ),
  };
}

function spreadOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.SPREAD_10Y2Y;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("SPREAD_10Y2Y", name);

  const valueText = formatValue(value, item.decimals, item.unit);

  if (value < 0) {
    return {
      vote: -0.75,
      weight: 3,
      risk: 2,
      signal: {
        code: "SPREAD_10Y2Y",
        indicator: name,
        severity: "alerta",
        title: "Curva invertida",
        message: `Spread 10Y-2Y en ${valueText}: la inversión de la curva suele preceder desaceleraciones.`,
      },
      interpretation: defineInterpretation(
        "SPREAD_10Y2Y",
        name,
        "negativo",
        `Curva 10Y-2Y en ${valueText}: invertida, una señal histórica de riesgo económico.`,
      ),
    };
  }

  if (value > 0.5) {
    return {
      vote: 0.3,
      weight: 3,
      risk: 0,
      interpretation: defineInterpretation(
        "SPREAD_10Y2Y",
        name,
        "positivo",
        `Curva 10Y-2Y en ${valueText}: pendiente positiva, sin señales de estrés en la curva.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 3,
    risk: 1,
    interpretation: defineInterpretation(
      "SPREAD_10Y2Y",
      name,
      "neutral",
      `Curva 10Y-2Y en ${valueText}: pendiente plana, sin una señal clara.`,
    ),
  };
}

function goldOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.GOLD;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("GOLD", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 2) {
    return {
      vote: -0.6,
      weight: 1.5,
      risk: 1,
      signal: {
        code: "GOLD",
        indicator: name,
        severity: "alerta",
        title: "Demanda de refugio",
        message: `El oro sube ${changeText}: los inversores buscan refugio.`,
      },
      interpretation: defineInterpretation(
        "GOLD",
        name,
        "negativo",
        `Oro en ${valueText} (${changeText}): la demanda de refugio sugiere cautela en el mercado.`,
      ),
    };
  }

  if (change !== null && change <= -2) {
    return {
      vote: 0.3,
      weight: 1.5,
      risk: 0,
      signal: {
        code: "GOLD",
        indicator: name,
        severity: "info",
        title: "Menor demanda de refugio",
        message: `El oro cede ${changeText}: baja la búsqueda de protección.`,
      },
      interpretation: defineInterpretation(
        "GOLD",
        name,
        "positivo",
        `Oro en ${valueText} (${changeText}): la menor demanda de refugio favorece el apetito de riesgo.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 1.5,
    risk: 0,
    interpretation: defineInterpretation(
      "GOLD",
      name,
      "neutral",
      `Oro en ${valueText} (${changeText}): sin una señal de refugio relevante.`,
    ),
  };
}

function btcOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.BTC;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("BTC", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 4) {
    return {
      vote: 0.75,
      weight: 1.5,
      risk: 0,
      signal: {
        code: "BTC",
        indicator: name,
        severity: "info",
        title: "Apetito de riesgo",
        message: `Bitcoin avanza ${changeText}: mayor disposición al riesgo.`,
      },
      interpretation: defineInterpretation(
        "BTC",
        name,
        "positivo",
        `Bitcoin en ${valueText} (${changeText}): el apetito de riesgo se mantiene firme.`,
      ),
    };
  }

  if (change !== null && change <= -4) {
    return {
      vote: -0.75,
      weight: 1.5,
      risk: 1,
      signal: {
        code: "BTC",
        indicator: name,
        severity: "alerta",
        title: "Aversión al riesgo",
        message: `Bitcoin cae ${changeText}: los activos de riesgo pierden interés.`,
      },
      interpretation: defineInterpretation(
        "BTC",
        name,
        "negativo",
        `Bitcoin en ${valueText} (${changeText}): la aversión al riesgo presiona a los activos especulativos.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 1.5,
    risk: 0,
    interpretation: defineInterpretation(
      "BTC",
      name,
      "neutral",
      `Bitcoin en ${valueText} (${changeText}): sin una señal clara de apetito de riesgo.`,
    ),
  };
}

function eurusdOutcome(item: AnalysisInputItem | undefined): RuleOutcome {
  const name = item?.name ?? CURATED_NAMES.EURUSD;
  const value = normalize(item?.value);
  if (!item || value === null) return unavailable("EURUSD", name);

  const change = normalize(item.weeklyChangePct);
  const changeText = formatWeeklyChange(change);
  const valueText = formatValue(value, item.decimals, item.unit);

  if (change !== null && change >= 1) {
    return {
      vote: 0.5,
      weight: 1,
      risk: 0,
      signal: {
        code: "EURUSD",
        indicator: name,
        severity: "info",
        title: "Dólar más débil",
        message: `EUR/USD sube ${changeText}: confirma un tono más débil del dólar.`,
      },
      interpretation: defineInterpretation(
        "EURUSD",
        name,
        "positivo",
        `EUR/USD en ${valueText} (${changeText}): el euro se fortalece frente al dólar.`,
      ),
    };
  }

  if (change !== null && change <= -1) {
    return {
      vote: -0.5,
      weight: 1,
      risk: 0,
      signal: {
        code: "EURUSD",
        indicator: name,
        severity: "info",
        title: "Dólar más fuerte",
        message: `EUR/USD cae ${changeText}: confirma un tono más firme del dólar.`,
      },
      interpretation: defineInterpretation(
        "EURUSD",
        name,
        "negativo",
        `EUR/USD en ${valueText} (${changeText}): el dólar gana terreno frente al euro.`,
      ),
    };
  }

  return {
    vote: 0,
    weight: 1,
    risk: 0,
    interpretation: defineInterpretation(
      "EURUSD",
      name,
      "neutral",
      `EUR/USD en ${valueText} (${changeText}): sin señales relevantes del dólar.`,
    ),
  };
}

function buildNews(
  news: AnalysisNewsInput[],
): { dto: AnalysisNewsDto; vote: number; weight: number; risk: number; signal?: AnalysisSignalDto } {
  const scored = news.filter(
    (item) => item.sentiment !== null && Number.isFinite(item.sentiment),
  );
  const average =
    scored.length > 0
      ? scored.reduce((sum, item) => sum + (item.sentiment as number), 0) / scored.length
      : null;
  const label: AnalysisNewsLabel =
    average === null
      ? "neutral"
      : average > ANALYSIS_NEWS_THRESHOLD
        ? "positivo"
        : average < -ANALYSIS_NEWS_THRESHOLD
          ? "negativo"
          : "neutral";

  const dto: AnalysisNewsDto = {
    count: news.length,
    label,
    averageSentiment: average === null ? null : Math.round(average * 1000) / 1000,
    items: news.map((item) => ({
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      sentiment: item.sentiment,
    })),
  };

  if (average === null) {
    return { dto, vote: 0, weight: 0, risk: 0 };
  }

  if (label === "positivo") {
    return {
      dto,
      vote: 0.75,
      weight: 3,
      risk: 0,
      signal: {
        code: "NEWS",
        indicator: "Noticias macro",
        severity: "info",
        title: "Contexto macro constructivo",
        message: `${news.length} titulares macro de la semana con sentimiento promedio positivo.`,
      },
    };
  }

  if (label === "negativo") {
    return {
      dto,
      vote: -0.75,
      weight: 3,
      risk: 1,
      signal: {
        code: "NEWS",
        indicator: "Noticias macro",
        severity: "alerta",
        title: "Contexto macro adverso",
        message: `${news.length} titulares macro de la semana con sentimiento promedio negativo.`,
      },
    };
  }

  return { dto, vote: 0, weight: 3, risk: 0 };
}

function newsSentence(label: AnalysisNewsLabel, count: number): string {
  if (count === 0) return "No hay noticias macro recientes para contrastar el escenario.";
  if (label === "positivo") return "Las noticias macro de la semana acompañan el tono constructivo.";
  if (label === "negativo") return "Las noticias macro de la semana añaden presión al escenario.";
  return "Las noticias macro de la semana no inclinan la balanza.";
}

function composeSummary(
  bias: AnalysisBias,
  riskLevel: AnalysisRiskLevel,
  signals: AnalysisSignalDto[],
  news: AnalysisNewsDto,
  hasData: boolean,
): string {
  if (!hasData) {
    return `Sin datos suficientes para interpretar la semana. El nivel de riesgo se mantiene en ${riskLevel} hasta recibir nuevas lecturas.`;
  }
  const lead =
    signals[0]?.message ??
    "Los indicadores curados no muestran señales relevantes esta semana.";
  const second = signals[1]?.message ? ` ${signals[1].message}` : "";
  return `Lectura semanal: sesgo ${bias} con riesgo ${riskLevel}. ${lead}${second} ${newsSentence(
    news.label,
    news.count,
  )} ${WEEK_SUGGESTIONS[bias]}`;
}

export function buildAnalysis(input: AnalysisInput): AnalysisDto {
  const byCode = new Map<string, AnalysisInputItem>();
  for (const item of input.items) byCode.set(item.code, item);

  const outcomes: RuleOutcome[] = [
    vixOutcome(byCode.get("VIX")),
    spxOutcome(byCode.get("SPX")),
    dxyOutcome(byCode.get("DXY")),
    treasuryOutcome(byCode.get("US10Y")),
    spreadOutcome(byCode.get("SPREAD_10Y2Y")),
    goldOutcome(byCode.get("GOLD")),
    btcOutcome(byCode.get("BTC")),
    eurusdOutcome(byCode.get("EURUSD")),
  ];

  let weighted = 0;
  let totalWeight = 0;
  let risk = 0;
  const signals: AnalysisSignalDto[] = [];
  const interpretations: IndicatorInterpretationDto[] = [];

  for (const outcome of outcomes) {
    weighted += outcome.vote * outcome.weight;
    totalWeight += outcome.weight;
    risk = Math.max(risk, outcome.risk);
    if (outcome.signal) signals.push(outcome.signal);
    interpretations.push(outcome.interpretation);
  }

  const news = buildNews(input.news);
  weighted += news.vote * news.weight;
  totalWeight += news.weight;
  risk = Math.max(risk, news.risk);
  if (news.signal) signals.push(news.signal);

  const score = totalWeight > 0 ? weighted / totalWeight : 0;
  const bias: AnalysisBias =
    score >= ANALYSIS_BIAS_THRESHOLD
      ? "alcista"
      : score <= -ANALYSIS_BIAS_THRESHOLD
        ? "bajista"
        : "neutral";
  const riskLevel = RISK_ORDER[Math.min(RISK_ORDER.length - 1, risk)]!;

  signals.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  return {
    asOf: input.generatedAt,
    bias,
    riskLevel,
    summary: composeSummary(bias, riskLevel, signals, news.dto, totalWeight > 0),
    signals,
    interpretations,
    news: news.dto,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}
