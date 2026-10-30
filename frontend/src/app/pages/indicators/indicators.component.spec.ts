import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IndicatorsComponent } from './indicators.component';
import { IndicatorChartComponent } from './indicator-chart.component';
import { IndicatorCompareTableComponent } from './indicator-compare-table.component';

const API = 'http://localhost:3000/api/v1/indicators';

function item(code: string, name: string, category = 'VOLATILITY') {
  return {
    code,
    name,
    category,
    unit: 'index',
    decimals: 2,
    value: 20.5,
    changePct: 1.2,
    asOf: new Date().toISOString(),
    status: 'fresh' as const,
    sparkline: [],
    intraday: category !== 'RATES',
  };
}

const PANEL = {
  generatedAt: new Date().toISOString(),
  stale: false,
  configured: true,
  quota: { used: 10, budget: 220 },
  groups: [
    { category: 'VOLATILITY', items: [item('VIX', 'VIX')] },
    { category: 'DOLLAR', items: [item('DXY', 'Dolar DXY', 'DOLLAR')] },
    { category: 'RATES', items: [item('US10Y', 'Bono 10Y', 'RATES')] },
  ],
};

function compareBody(range: string, codes: string[]) {
  return {
    range,
    missing: [],
    series: codes.map((code) => ({
      code,
      name: code,
      decimals: 2,
      unit: 'index',
      changePeriodPct: 3,
      base100: [
        { t: '2026-01-01', v: 100 },
        { t: '2026-01-02', v: 103 },
      ],
    })),
  };
}

describe('IndicatorsComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IndicatorsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function create() {
    const fixture = TestBed.createComponent(IndicatorsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function flushPanel() {
    http.expectOne(API).flush(PANEL);
  }

  function pendingCompare() {
    return http.match((req) => req.url === `${API}/compare`);
  }

  it('should create the component', () => {
    const fixture = create();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="indicators-title"]')?.textContent).toContain(
      'Indicadores',
    );
    http.match(() => true);
  });

  it('should show the loading state initially', () => {
    const fixture = create();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="indicators-loading"]')).toBeTruthy();
    http.match(() => true);
  });

  it('should render cards and show an error with retry when the panel fails', async () => {
    const fixture = create();
    http.expectOne(API).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="indicators-error"]')).toBeTruthy();
    (el.querySelector('[data-testid="indicators-retry"]') as HTMLButtonElement).click();
    flushPanel();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="indicator-VIX"]')).toBeTruthy();
    http.match(() => true);
  });

  it('should request a new comparison when switching tab, range and pill', () => {
    const fixture = create();
    flushPanel();
    pendingCompare();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="indicator-VIX"]')).toBeTruthy();

    (el.querySelector('[data-testid="tab-history"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const first = pendingCompare();
    expect(first.length).toBeGreaterThan(0);
    const last = first[first.length - 1]!;
    expect(last.request.params.get('range')).toBe('1Y');
    last.flush(compareBody('1Y', ['VIX', 'DXY', 'US10Y']));
    fixture.detectChanges();
    expect(el.querySelector('app-indicator-compare-table')).toBeTruthy();
    expect(fixture.debugElement.query((n) => n.name === 'app-indicator-chart')).toBeTruthy();

    const rangeButtons = Array.from(el.querySelectorAll<HTMLButtonElement>('.ranges__btn'));
    rangeButtons.find((b) => b.textContent?.trim() === '3M')!.click();
    fixture.detectChanges();
    const byRange = pendingCompare();
    const rangeReq = byRange[byRange.length - 1]!;
    expect(rangeReq.request.params.get('range')).toBe('3M');
    rangeReq.flush(compareBody('3M', ['VIX', 'DXY', 'US10Y']));
    fixture.detectChanges();

    (el.querySelector('[data-testid="pill-DXY"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const byPill = pendingCompare();
    const pillReq = byPill[byPill.length - 1]!;
    expect(pillReq.request.params.get('codes')).toBe('VIX,US10Y');
    pillReq.flush(compareBody('3M', ['VIX', 'US10Y']));
    fixture.detectChanges();

    const chart = fixture.debugElement.query((n) => n.name === 'app-indicator-chart');
    const series = (chart.componentInstance as IndicatorChartComponent).series();
    expect(series.map((s) => s.code)).toEqual(['VIX', 'US10Y']);
    const table = fixture.debugElement.query((n) => n.name === 'app-indicator-compare-table');
    expect(table.componentInstance as IndicatorCompareTableComponent).toBeTruthy();
    http.match(() => true);
  });

  it('live: pestañas por categoría, rangos y estadísticas del gráfico', () => {
    const fixture = create();
    flushPanel();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const historyReqs = () => http.match((req) => req.url.endsWith('/history'));
    const click = (testId: string) =>
      (el.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    const series = (code: string, range: string) => ({
      code,
      name: code,
      unit: 'index',
      decimals: 2,
      range,
      granularity: range === '5MIN' ? 'intraday' : 'daily',
      bucketMinutes: range === '5MIN' ? 5 : null,
      points: [
        { t: '2026-01-01', v: 10 },
        { t: '2026-01-02', v: 12 },
        { t: '2026-01-03', v: 11 },
      ],
    });

    const first = historyReqs();
    expect(first.length).toBe(1);
    expect(first[0]!.request.url).toContain('/VIX/history');
    expect(first[0]!.request.params.get('range')).toBe('1M');
    first[0]!.flush(series('VIX', '1M'));
    fixture.detectChanges();
    expect(el.querySelector('.card__sparkline')).toBeNull();
    expect(el.querySelector('[data-testid="live-cat-DOLLAR"]')).toBeNull();
    expect(el.querySelector('[data-testid="live-cat-EQUITY"]')).toBeTruthy();
    const stats = el.querySelector('[data-testid="live-stats"]')!.textContent!;
    expect(stats).toMatch(/12[.,]00/);
    expect(stats).toMatch(/10[.,]00/);

    click('live-range-5MIN');
    fixture.detectChanges();
    const intraday = historyReqs();
    expect(intraday[intraday.length - 1]!.request.params.get('range')).toBe('5MIN');
    intraday[intraday.length - 1]!.flush(series('VIX', '5MIN'));

    click('live-cat-EQUITY');
    fixture.detectChanges();
    const dollar = historyReqs();
    expect(dollar[dollar.length - 1]!.request.url).toContain('/DXY/history');

    click('live-cat-RATES');
    fixture.detectChanges();
    const rates = historyReqs();
    const last = rates[rates.length - 1]!;
    expect(last.request.url).toContain('/US10Y/history');
    expect(last.request.params.get('range')).toBe('1M');
    expect(
      (el.querySelector('[data-testid="live-range-5MIN"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    http.match(() => true);
  });

  it('should poll every 60s, pause while hidden and stop on destroy', () => {
    vi.useFakeTimers();
    const fixture = create();
    flushPanel();
    const setVisibility = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
      document.dispatchEvent(new Event('visibilitychange'));
    };

    vi.advanceTimersByTime(60_000);
    http.expectOne(API).flush(PANEL);

    setVisibility('hidden');
    vi.advanceTimersByTime(180_000);
    http.expectNone(API);

    setVisibility('visible');
    http.expectOne(API).flush(PANEL);

    fixture.destroy();
    vi.advanceTimersByTime(180_000);
    http.expectNone(API);
    setVisibility('visible');
    http.expectNone(API);
    http.match(() => true);
  });
});
