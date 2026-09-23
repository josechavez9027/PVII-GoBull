import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OperationsService, Operation, CapitalSummary, Position } from './operations.service';

describe('OperationsService', () => {
  let service: OperationsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OperationsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OperationsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch filtered operations with query params', () => {
    const mockOps: Operation[] = [
      {
        id: '1',
        type: 'BUY',
        name: 'Apple Inc.',
        symbol: 'AAPL',
        date: '2026-09-22T00:00:00.000Z',
        qty: 10,
        totalPrice: 1500,
        createdAt: '2026-09-22T00:00:00.000Z',
      },
    ];

    service
      .getOperations({ type: 'BUY', from: '2026-09-01', to: '2026-09-30', q: 'AAPL' })
      .subscribe((res) => {
        expect(res.operations.length).toBe(1);
        expect(res.operations[0].symbol).toBe('AAPL');
      });

    const req = httpTesting.expectOne(
      (r) =>
        r.url === 'http://localhost:3000/api/v1/operations' &&
        r.params.get('type') === 'BUY' &&
        r.params.get('from') === '2026-09-01' &&
        r.params.get('to') === '2026-09-30' &&
        r.params.get('q') === 'AAPL',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ operations: mockOps });
  });

  it('should fetch summary metrics', () => {
    const mockSummary: CapitalSummary = {
      caja: 2170,
      patrimonio: 3070,
      neutral: 3000,
    };

    service.getSummary().subscribe((res) => {
      expect(res.summary.caja).toBe(2170);
      expect(res.summary.patrimonio).toBe(3070);
      expect(res.summary.neutral).toBe(3000);
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/operations/summary');
    expect(req.request.method).toBe('GET');
    req.flush({ summary: mockSummary });
  });

  it('should fetch open positions', () => {
    const mockPositions: Position[] = [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        qty: 6,
        avgCost: 150,
        totalCost: 900,
      },
    ];

    service.getPositions().subscribe((res) => {
      expect(res.positions.length).toBe(1);
      expect(res.positions[0].symbol).toBe('AAPL');
      expect(res.positions[0].avgCost).toBe(150);
      expect(res.positions[0].totalCost).toBe(900);
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/operations/positions');
    expect(req.request.method).toBe('GET');
    req.flush({ positions: mockPositions });
  });

  it('should send POST request to create operation', () => {
    const newOp = {
      type: 'BUY' as const,
      name: 'Apple Inc.',
      symbol: 'AAPL',
      qty: 10,
      totalPrice: 1500,
      date: '2026-09-22',
    };

    service.createOperation(newOp).subscribe((res) => {
      expect(res.operation.id).toBe('op-123');
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/operations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.symbol).toBe('AAPL');
    req.flush({ operation: { id: 'op-123', ...newOp, createdAt: new Date().toISOString() } });
  });

  it('should send DELETE request to remove operation', () => {
    service.deleteOperation('op-123').subscribe((res) => {
      expect(res.message).toBe('Operacion eliminada correctamente');
    });

    const req = httpTesting.expectOne('http://localhost:3000/api/v1/operations/op-123');
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'Operacion eliminada correctamente' });
  });
});
