import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the GoBull operations shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="brand"]')?.textContent).toContain('GoBull');
    expect(compiled.querySelector('h1')?.textContent).toContain('Exportaciones');
    expect(compiled.querySelector('[data-testid="operations-table"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="download-action"]')?.textContent).toContain(
      'Descargar',
    );
  });

  it('should define a separate hover fill color for outlined buttons', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const componentStyles = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .find((styles) => styles.includes('.outline-button'));

    expect(componentStyles).toMatch(/background:\s*var\(--button-color\)/);
  });
});
