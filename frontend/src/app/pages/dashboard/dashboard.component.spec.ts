import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import {
  OperationsService,
  Operation,
  CapitalSummary,
  Position,
} from '../../core/services/operations.service';
import { ExportService } from '../../core/services/export.service';
import {
  InstrumentsService,
  Instrument,
} from '../../core/services/instruments.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let operationsService: any;
  let exportService: any;

  const mockOperations: Operation[] = [
    {
      id: 'op-1',
      type: 'DEP',
      name: 'Deposito inicial',
      symbol: null,
      date: '2026-09-01T10:00:00.000Z',
      qty: 1,
      totalPrice: 5000,
      createdAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'op-2',
      type: 'BUY',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-05T10:00:00.000Z',
      qty: 10,
      totalPrice: 1500,
      createdAt: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'op-3',
      type: 'SELL',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-10T10:00:00.000Z',
      qty: 4,
      totalPrice: 640,
      createdAt: '2026-09-10T10:00:00.000Z',
    },
    {
      id: 'op-4',
      type: 'DIV',
      name: 'Dividendo',
      symbol: null,
      date: '2026-09-12T10:00:00.000Z',
      qty: 1,
      totalPrice: 50,
      createdAt: '2026-09-12T10:00:00.000Z',
    },
    {
      id: 'op-5',
      type: 'RET',
      name: 'Retiro',
      symbol: null,
      date: '2026-09-15T10:00:00.000Z',
      qty: 1,
      totalPrice: 2000,
      createdAt: '2026-09-15T10:00:00.000Z',
    },
    {
      id: 'op-6',
      type: 'TAX',
      name: 'Impuesto',
      symbol: null,
      date: '2026-09-20T10:00:00.000Z',
      qty: 1,
      totalPrice: 20,
      createdAt: '2026-09-20T10:00:00.000Z',
    },
  ];

  const mockSummary: CapitalSummary = {
    caja: 2170,
    patrimonio: 3070,
    neutral: 3000,
  };

  const mockPositions: Position[] = [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      qty: 6,
      avgCost: 150,
      totalCost: 900,
    },
  ];

  const mockInstruments: Instrument[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ', kind: 'STOCK' },
    {
      symbol: 'AAPD',
      name: 'DIREXION DAILY AAPL BEAR 1X SHARES',
      market: 'NASDAQ',
      kind: 'ETF',
    },
  ];

  beforeEach(async () => {
    const opsSpy = {
      getOperations: vi.fn().mockReturnValue(of({ operations: mockOperations })),
      getSummary: vi.fn().mockReturnValue(of({ summary: mockSummary })),
      getPositions: vi.fn().mockReturnValue(of({ positions: mockPositions })),
      createOperation: vi.fn().mockReturnValue(of({ operation: mockOperations[0] })),
      deleteOperation: vi.fn().mockReturnValue(of({ message: 'OK' })),
    };

    const expSpy = {
      exportToExcel: vi.fn().mockResolvedValue(undefined),
      exportToPdf: vi.fn().mockResolvedValue(undefined),
    };

    const instSpy = {
      suggest: vi.fn().mockReturnValue(of({ instruments: mockInstruments })),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: OperationsService, useValue: opsSpy },
        { provide: ExportService, useValue: expSpy },
        { provide: InstrumentsService, useValue: instSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    operationsService = TestBed.inject(OperationsService);
    exportService = TestBed.inject(ExportService);
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and load operations, summary, and positions', () => {
    expect(component).toBeTruthy();
    expect(component.operations.length).toBe(6);
    expect(component.summary.caja).toBe(2170);
    expect(component.summary.patrimonio).toBe(3070);
    expect(component.summary.neutral).toBe(3000);
    expect(component.positions.length).toBe(1);
    expect(component.positions[0].symbol).toBe('AAPL');
    expect(component.positions[0].qty).toBe(6);
  });

  it('should calculate performance vs neutral correctly', () => {
    // 3070 patrimonio vs 3000 neutral -> +70 (+2.33%)
    const perf = component.getPerformanceVsNeutral();
    expect(perf.diff).toBe(70);
    expect(perf.status).toBe('positive');
  });

  it('should switch tabs between operations and analysis', () => {
    expect(component.activeTab).toBe('operations');
    component.setTab('analysis');
    expect(component.activeTab).toBe('analysis');
    component.setTab('operations');
    expect(component.activeTab).toBe('operations');
  });

  it('should auto-fill default names on type change for cash-flow operations and clear for DIV', () => {
    component.createForm.type = 'DEP';
    component.onTypeChange();
    expect(component.createForm.name).toBe('Depósito');

    component.createForm.type = 'RET';
    component.onTypeChange();
    expect(component.createForm.name).toBe('Retiro');

    component.createForm.type = 'TAX';
    component.onTypeChange();
    expect(component.createForm.name).toBe('Impuesto');

    component.createForm.type = 'DIV';
    component.onTypeChange();
    expect(component.createForm.name).toBe('');
    expect(component.showsSymbolField()).toBe(true);
    expect(component.createForm.qty).toBe(1);
  });

  it('should block SELL if quantity exceeds available open position', () => {
    component.createForm = {
      type: 'SELL',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-22',
      qty: 10, // Available is only 6
      totalPrice: 1600,
    };

    component.submitCreate();
    expect(component.createError).toContain(
      'No se puede vender: la posición abierta de AAPL es de 6 acciones',
    );
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should validate symbol is required for BUY', () => {
    component.createForm = {
      type: 'BUY',
      name: 'Apple Inc.',
      symbol: '',
      date: '2026-09-22',
      qty: 5,
      totalPrice: 750,
    };

    component.submitCreate();
    expect(component.createError).toContain('El símbolo es obligatorio');
  });

  it('should call export service on exportExcel and exportPdf', async () => {
    await component.exportExcel();
    expect(exportService.exportToExcel).toHaveBeenCalledWith(
      component.operations,
      component.summary,
      expect.any(String),
    );

    await component.exportPdf();
    expect(exportService.exportToPdf).toHaveBeenCalledWith(
      component.operations,
      component.summary,
      expect.any(String),
    );
  });

  it('should open delete modal and confirm deletion', () => {
    const op = mockOperations[0];
    component.openDeleteModal(op);
    expect(component.showDeleteModal).toBe(true);
    expect(component.operationToDelete).toBe(op);

    component.confirmDelete();
    expect(operationsService.deleteOperation).toHaveBeenCalledWith(op.id);
  });

  it('should fetch symbol suggestions with debounce', () => {
    vi.useFakeTimers();
    try {
      const instService = TestBed.inject(InstrumentsService) as any;
      component.createForm.symbol = 'AA';
      component.onSymbolInput();
      expect(instService.suggest).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(instService.suggest).toHaveBeenCalledWith('AA', 8);
      expect(component.showSymbolSuggestions).toBe(true);
      expect(component.symbolSuggestions.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should close suggestions when symbol input is empty', () => {
    component.showSymbolSuggestions = true;
    component.createForm.symbol = '   ';
    component.onSymbolInput();
    expect(component.showSymbolSuggestions).toBe(false);
  });

  it('should auto-fill symbol and name on suggestion select', () => {
    component.createForm.symbol = 'AA';
    component.createForm.name = '';
    component.selectSymbolSuggestion(mockInstruments[0]);
    expect(component.createForm.symbol).toBe('AAPL');
    expect(component.createForm.name).toBe('Apple Inc.');
    expect(component.showSymbolSuggestions).toBe(false);
  });

  it('should navigate suggestions with keyboard and select with Enter', () => {
    component.symbolSuggestions = mockInstruments;
    component.showSymbolSuggestions = true;
    component.activeSuggestionIndex = -1;

    component.onSymbolKeydown({ key: 'ArrowDown', preventDefault: () => {} } as any);
    expect(component.activeSuggestionIndex).toBe(0);
    component.onSymbolKeydown({ key: 'ArrowDown', preventDefault: () => {} } as any);
    expect(component.activeSuggestionIndex).toBe(1);
    component.onSymbolKeydown({ key: 'ArrowUp', preventDefault: () => {} } as any);
    expect(component.activeSuggestionIndex).toBe(0);
    component.onSymbolKeydown({ key: 'Enter', preventDefault: () => {} } as any);
    expect(component.createForm.symbol).toBe('AAPL');
    expect(component.createForm.name).toBe('Apple Inc.');
    expect(component.showSymbolSuggestions).toBe(false);
  });

  it('should close suggestions on Escape', () => {
    component.symbolSuggestions = mockInstruments;
    component.showSymbolSuggestions = true;
    component.onSymbolKeydown({ key: 'Escape' } as any);
    expect(component.showSymbolSuggestions).toBe(false);
  });

  it('should show symbol field for BUY, SELL and DIV only', () => {
    component.createForm.type = 'BUY';
    expect(component.showsSymbolField()).toBe(true);
    component.createForm.type = 'SELL';
    expect(component.showsSymbolField()).toBe(true);
    component.createForm.type = 'DIV';
    expect(component.showsSymbolField()).toBe(true);
    component.createForm.type = 'DEP';
    expect(component.showsSymbolField()).toBe(false);
    component.createForm.type = 'TAX';
    expect(component.showsSymbolField()).toBe(false);
  });

  it('should block DIV without symbol', () => {
    component.createForm = {
      type: 'DIV',
      name: 'Dividendo',
      symbol: '',
      date: '2026-09-22',
      qty: 1,
      totalPrice: 50,
    };

    component.submitCreate();
    expect(component.createError).toContain('El símbolo es obligatorio para registrar un dividendo');
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should submit DIV with catalog symbol and auto-filled name', () => {
    component.createForm = {
      type: 'DIV',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-22',
      qty: 1,
      totalPrice: 50,
    };

    component.submitCreate();
    expect(operationsService.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DIV', name: 'Apple Inc.', symbol: 'AAPL' }),
    );
  });

  it('should guide to catalog when name is empty on trade types', () => {
    component.createForm = {
      type: 'BUY',
      name: '   ',
      symbol: 'AAPL',
      date: '2026-09-22',
      qty: 5,
      totalPrice: 750,
    };

    component.submitCreate();
    expect(component.createError).toContain('Selecciona un instrumento del catálogo');
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should block BUY when totalPrice exceeds available cash in caja', () => {
    // mockSummary.caja is 2170
    component.createForm = {
      type: 'BUY',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-22',
      qty: 10,
      totalPrice: 2500, // 2500 > 2170
    };

    expect(component.hasInsufficientCash()).toBe(true);
    component.submitCreate();
    expect(component.createError).toContain('supera la caja disponible');
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should block RET when totalPrice exceeds available cash in caja', () => {
    component.createForm = {
      type: 'RET',
      name: 'Retiro',
      symbol: '',
      date: '2026-09-22',
      qty: 1,
      totalPrice: 3000, // 3000 > 2170
    };

    expect(component.hasInsufficientCash()).toBe(true);
    component.submitCreate();
    expect(component.createError).toContain('supera la caja disponible');
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should block TAX when totalPrice exceeds available cash in caja', () => {
    component.createForm = {
      type: 'TAX',
      name: 'Impuesto',
      symbol: '',
      date: '2026-09-22',
      qty: 1,
      totalPrice: 2200, // 2200 > 2170
    };

    expect(component.hasInsufficientCash()).toBe(true);
    component.submitCreate();
    expect(component.createError).toContain('supera la caja disponible');
    expect(operationsService.createOperation).not.toHaveBeenCalled();
  });

  it('should allow BUY when totalPrice is within available cash in caja', () => {
    component.createForm = {
      type: 'BUY',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      date: '2026-09-22',
      qty: 5,
      totalPrice: 1000, // 1000 <= 2170
    };

    expect(component.hasInsufficientCash()).toBe(false);
    component.submitCreate();
    expect(operationsService.createOperation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BUY', totalPrice: 1000 }),
    );
  });
});
