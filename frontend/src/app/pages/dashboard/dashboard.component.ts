import {
  Component,
  OnInit,
  OnDestroy,
  Inject,
  PLATFORM_ID,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  OperationsService,
  Operation,
  OperationType,
  Position,
  CapitalSummary,
  CreateOperationDto,
} from '../../core/services/operations.service';
import { ExportService } from '../../core/services/export.service';
import { InstrumentsService, Instrument } from '../../core/services/instruments.service';
import { AuthService, User } from '../../core/services/auth.service';
export type SortColumn =
  | 'type'
  | 'name'
  | 'symbol'
  | 'date'
  | 'qty'
  | 'unitPrice'
  | 'totalPrice'
  | '';
export type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly navigation = [
    { label: 'Inicio', icon: '⌂', active: true },
    { label: 'Operaciones', icon: '▣' },
    { label: 'Noticias', icon: '▤' },
  ];

  // Active tab
  activeTab: 'operations' | 'analysis' = 'operations';

  // Data
  operations: Operation[] = [];
  allOperations: Operation[] = [];
  positions: Position[] = [];
  summary: CapitalSummary = { caja: 0, patrimonio: 0, neutral: 0 };
  isLoading = false;
  errorMessage = '';

  // Pagination & Sorting
  pageSize: number = 10;
  readonly pageSizeOptions: number[] = [10, 20, 50];
  currentPage: number = 1;
  sortColumn: SortColumn = '';
  sortDirection: SortDirection = 'asc';

  // Filters
  filterType: OperationType | '' = '';
  filterFrom: string = '';
  filterTo: string = '';
  filterQuery: string = '';

  // Create Modal
  showCreateModal = false;
  isSubmittingCreate = false;
  createError = '';
  createForm: {
    type: OperationType;
    name: string;
    symbol: string;
    date: string;
    qty: number;
    totalPrice: number | null;
  } = {
    type: 'DEP',
    name: 'Depósito',
    symbol: '',
    date: this.getTodayDateString(),
    qty: 1,
    totalPrice: null,
  };

  // Delete Modal
  showDeleteModal = false;
  operationToDelete: Operation | null = null;
  isSubmittingDelete = false;
  deleteError = '';

  // Symbol autocomplete (BUY, SELL y DIV)
  symbolSuggestions: Instrument[] = [];
  showSymbolSuggestions = false;
  activeSuggestionIndex = -1;
  isSuggestingSymbols = false;
  private symbolSuggestTimer: ReturnType<typeof setTimeout> | null = null;

  // User profile & session
  currentUser: User | null = null;
  showProfileMenu = false;

  // Chart instance
  private chartInstance: any = null;
  private isBrowser: boolean;

  constructor(
    private operationsService: OperationsService,
    private exportService: ExportService,
    private instrumentsService: InstrumentsService,
    private authService: AuthService,
    private router: Router,
    private hostElement: ElementRef,
    private cd: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.loadData();
    this.loadUser();
  }

  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    if (this.symbolSuggestTimer) {
      clearTimeout(this.symbolSuggestTimer);
      this.symbolSuggestTimer = null;
    }
  }

  setTab(tab: 'operations' | 'analysis'): void {
    this.activeTab = tab;
    if (tab === 'analysis') {
      setTimeout(() => {
        this.renderChart();
      }, 50);
    }
  }

  loadData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Fetch filtered operations for the table
    this.operationsService
      .getOperations({
        type: this.filterType || undefined,
        from: this.filterFrom || undefined,
        to: this.filterTo || undefined,
        q: this.filterQuery || undefined,
      })
      .subscribe({
        next: (res) => {
          this.operations = res.operations;
          if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
          }
          this.isLoading = false;
          this.cd.markForCheck();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Error al cargar operaciones';
          this.isLoading = false;
          this.cd.markForCheck();
        },
      });

    // Always fetch all unfiltered operations for chart and full history
    this.operationsService.getOperations().subscribe({
      next: (res) => {
        this.allOperations = res.operations;
        if (this.activeTab === 'analysis') {
          this.renderChart();
        }
      },
      error: () => {},
    });

    // Fetch summary metrics
    this.operationsService.getSummary().subscribe({
      next: (res) => {
        this.summary = res.summary;
        this.cd.markForCheck();
      },
      error: () => {},
    });

    // Fetch open positions
    this.operationsService.getPositions().subscribe({
      next: (res) => {
        this.positions = res.positions;
        this.cd.markForCheck();
      },
      error: () => {},
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadData();
  }

  resetFilters(): void {
    this.filterType = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.filterQuery = '';
    this.currentPage = 1;
    this.loadData();
  }

  getFilterDescription(): string {
    const parts: string[] = [];
    if (this.filterType) parts.push(`Tipo: ${this.filterType}`);
    if (this.filterFrom) parts.push(`Desde: ${this.filterFrom}`);
    if (this.filterTo) parts.push(`Hasta: ${this.filterTo}`);
    if (this.filterQuery) parts.push(`Búsqueda: "${this.filterQuery}"`);
    return parts.length > 0 ? parts.join(', ') : 'Todas las operaciones (sin filtros)';
  }

  // SORTING & PAGINATION
  get sortedOperations(): Operation[] {
    if (!this.sortColumn) {
      return this.operations;
    }

    const col = this.sortColumn;
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    return [...this.operations].sort((a, b) => {
      switch (col) {
        case 'type':
          return a.type.localeCompare(b.type) * dir;
        case 'name':
          return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }) * dir;
        case 'symbol': {
          const symA = a.symbol || '';
          const symB = b.symbol || '';
          if (!symA && !symB) return 0;
          if (!symA) return 1;
          if (!symB) return -1;
          return symA.localeCompare(symB, 'es', { sensitivity: 'base' }) * dir;
        }
        case 'date':
          return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
        case 'qty':
          return (a.qty - b.qty) * dir;
        case 'unitPrice': {
          const unitA = a.totalPrice / (a.qty || 1);
          const unitB = b.totalPrice / (b.qty || 1);
          return (unitA - unitB) * dir;
        }
        case 'totalPrice':
          return (a.totalPrice - b.totalPrice) * dir;
        default:
          return 0;
      }
    });
  }

  get paginatedOperations(): Operation[] {
    const sorted = this.sortedOperations;
    const start = (this.currentPage - 1) * this.pageSize;
    return sorted.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.operations.length / this.pageSize));
  }

  get pageStart(): number {
    if (this.operations.length === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.operations.length);
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.cd.markForCheck();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.setPage(this.currentPage - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.setPage(this.currentPage + 1);
    }
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = Number(newSize);
    this.currentPage = 1;
    this.cd.markForCheck();
  }

  sortBy(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.currentPage = 1;
    this.cd.markForCheck();
  }

  getAriaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn !== column) {
      return 'none';
    }
    return this.sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  getPages(): number[] {
    const total = this.totalPages;
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const current = this.currentPage;
    const pages = new Set<number>();
    pages.add(1);
    pages.add(total);
    for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
      pages.add(i);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  // USER PROFILE & SESSION
  loadUser(): void {
    this.authService.me().subscribe({
      next: (res) => {
        this.currentUser = res.user;
        this.cd.markForCheck();
      },
      error: () => {},
    });
  }

  getUserInitials(): string {
    const name = (this.currentUser?.name || '').trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      if (parts[0].length >= 2) {
        return parts[0].slice(0, 2).toUpperCase();
      }
      return parts[0][0].toUpperCase();
    }

    const email = (this.currentUser?.email || '').trim();
    if (email) {
      const username = email.split('@')[0];
      const emailParts = username.split(/[._-]/).filter(Boolean);
      if (emailParts.length >= 2) {
        return (emailParts[0][0] + emailParts[1][0]).toUpperCase();
      }
      if (username.length >= 2) {
        return username.slice(0, 2).toUpperCase();
      }
      return username[0].toUpperCase();
    }

    return 'US';
  }

  toggleProfileMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showProfileMenu = !this.showProfileMenu;
    this.cd.markForCheck();
  }

  closeProfileMenu(): void {
    this.showProfileMenu = false;
    this.cd.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showProfileMenu && this.hostElement?.nativeElement) {
      const container = this.hostElement.nativeElement.querySelector('.profile-menu-container');
      if (container && !container.contains(event.target as Node)) {
        this.showProfileMenu = false;
        this.cd.markForCheck();
      }
    }
  }

  onProfileKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.showProfileMenu) {
      this.showProfileMenu = false;
      this.cd.markForCheck();
    }
  }

  logout(): void {
    this.showProfileMenu = false;
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: () => {
        this.router.navigate(['/login']);
      },
    });
  }

  // CREATE OPERATION
  openCreateModal(): void {
    this.createError = '';
    this.createForm = {
      type: 'DEP',
      name: 'Depósito',
      symbol: '',
      date: this.getTodayDateString(),
      qty: 1,
      totalPrice: null,
    };
    this.closeSymbolSuggestions();
    this.showCreateModal = true;
  }

  closeCreateModal(): void {
    if (!this.isSubmittingCreate) {
      this.showCreateModal = false;
      this.createError = '';
      this.closeSymbolSuggestions();
    }
  }

  onTypeChange(): void {
    const defaultNames: Record<string, string> = {
      DEP: 'Depósito',
      RET: 'Retiro',
      TAX: 'Impuesto',
    };

    if (this.showsSymbolField()) {
      if (
        this.createForm.name === 'Depósito' ||
        this.createForm.name === 'Deposito' ||
        this.createForm.name === 'Retiro' ||
        this.createForm.name === 'Impuesto' ||
        this.createForm.name === 'Dividendo' ||
        this.createForm.name === 'Diviendos' ||
        this.createForm.name === 'Dividendos'
      ) {
        this.createForm.name = '';
      }
      this.createForm.qty = this.isTradeType() ? (this.createForm.qty || 1) : 1;
    } else {
      this.createForm.name = defaultNames[this.createForm.type] || '';
      this.createForm.symbol = '';
      this.createForm.qty = 1;
      this.closeSymbolSuggestions();
    }
    this.createError = '';
  }

  isTradeType(): boolean {
    return this.createForm.type === 'BUY' || this.createForm.type === 'SELL';
  }

  isCashOutflowType(): boolean {
    return (
      this.createForm.type === 'BUY' ||
      this.createForm.type === 'RET' ||
      this.createForm.type === 'TAX'
    );
  }

  getAvailableCash(): number {
    return this.summary ? this.summary.caja : 0;
  }

  hasInsufficientCash(): boolean {
    if (!this.isCashOutflowType()) {
      return false;
    }
    const total = Number(this.createForm.totalPrice || 0);
    return total > this.getAvailableCash() + 0.0001;
  }

  showsSymbolField(): boolean {
    return (
      this.isTradeType() || this.createForm.type === 'DIV'
    );
  }

  // SYMBOL AUTOCOMPLETE
  onSymbolInput(): void {
    if (this.symbolSuggestTimer) {
      clearTimeout(this.symbolSuggestTimer);
      this.symbolSuggestTimer = null;
    }
    const q = (this.createForm.symbol || '').trim();
    if (q.length < 1) {
      this.closeSymbolSuggestions();
      return;
    }
    this.symbolSuggestTimer = setTimeout(() => this.fetchSymbolSuggestions(q), 250);
  }

  private fetchSymbolSuggestions(q: string): void {
    this.isSuggestingSymbols = true;
    this.instrumentsService.suggest(q, 8).subscribe({
      next: (res) => {
        this.symbolSuggestions = res.instruments;
        this.showSymbolSuggestions = this.symbolSuggestions.length > 0;
        this.activeSuggestionIndex = -1;
        this.isSuggestingSymbols = false;
        this.cd.markForCheck();
      },
      error: () => {
        this.isSuggestingSymbols = false;
        this.cd.markForCheck();
      },
    });
  }

  selectSymbolSuggestion(inst: Instrument): void {
    this.createForm.symbol = inst.symbol.toUpperCase();
    this.createForm.name = inst.name;
    this.createError = '';
    this.closeSymbolSuggestions();
    this.cd.markForCheck();
  }

  onSymbolKeydown(event: KeyboardEvent): void {
    if (!this.showSymbolSuggestions || this.symbolSuggestions.length === 0) {
      if (event.key === 'Escape') {
        this.closeSymbolSuggestions();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.resolveSymbolName();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeSuggestionIndex =
        (this.activeSuggestionIndex + 1) % this.symbolSuggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeSuggestionIndex =
        (this.activeSuggestionIndex - 1 + this.symbolSuggestions.length) %
        this.symbolSuggestions.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.activeSuggestionIndex >= 0) {
        this.selectSymbolSuggestion(this.symbolSuggestions[this.activeSuggestionIndex]);
      } else {
        this.resolveSymbolName();
        this.closeSymbolSuggestions();
      }
    } else if (event.key === 'Escape') {
      this.closeSymbolSuggestions();
    }
  }

  onSymbolBlur(): void {
    // Retraso para que el mousedown en la sugerencia gane al blur y se resuelva el nombre
    setTimeout(() => {
      this.resolveSymbolName();
      this.closeSymbolSuggestions();
    }, 200);
  }

  resolveSymbolName(): void {
    const sym = (this.createForm.symbol || '').trim().toUpperCase();
    if (!sym) {
      if (this.showsSymbolField()) {
        this.createForm.name = '';
      }
      return;
    }
    const exact = this.symbolSuggestions.find((s) => s.symbol.toUpperCase() === sym);
    if (exact) {
      this.createForm.symbol = exact.symbol;
      this.createForm.name = exact.name;
      this.cd.markForCheck();
      return;
    }
    if (!this.createForm.name && this.showsSymbolField()) {
      this.instrumentsService.suggest(sym, 1).subscribe({
        next: (res) => {
          const match = res.instruments.find((i) => i.symbol.toUpperCase() === sym);
          if (match) {
            this.createForm.symbol = match.symbol;
            this.createForm.name = match.name;
            this.cd.markForCheck();
          }
        },
        error: () => {},
      });
    }
  }

  private closeSymbolSuggestions(): void {
    this.showSymbolSuggestions = false;
    this.activeSuggestionIndex = -1;
    this.symbolSuggestions = [];
  }

  getOpenQtyForSymbol(symbol: string): number {
    const norm = (symbol || '').trim().toUpperCase();
    const pos = this.positions.find((p) => p.symbol.toUpperCase() === norm);
    return pos ? pos.qty : 0;
  }

  submitCreate(): void {
    this.createError = '';

    if (!this.createForm.name.trim()) {
      this.createError =
        this.isTradeType() || this.createForm.type === 'DIV'
          ? 'Selecciona un instrumento del catálogo: el nombre se completa en automático'
          : 'El nombre es obligatorio';
      return;
    }

    if (this.isTradeType()) {
      if (!this.createForm.symbol.trim()) {
        this.createError = 'El símbolo es obligatorio para compras y ventas';
        return;
      }
      if (!this.createForm.qty || this.createForm.qty <= 0) {
        this.createError = 'La cantidad debe ser mayor a 0';
        return;
      }
      if (this.createForm.type === 'SELL') {
        const available = this.getOpenQtyForSymbol(this.createForm.symbol);
        if (this.createForm.qty > available) {
          this.createError = `No se puede vender: la posición abierta de ${this.createForm.symbol.toUpperCase()} es de ${available} acciones`;
          return;
        }
      }
    } else if (this.createForm.type === 'DIV' && !this.createForm.symbol.trim()) {
      this.createError = 'El símbolo es obligatorio para registrar un dividendo';
      return;
    }

    if (!this.createForm.totalPrice || this.createForm.totalPrice <= 0) {
      this.createError = 'El monto total debe ser mayor a 0';
      return;
    }

    if (this.isCashOutflowType()) {
      const available = this.getAvailableCash();
      const total = Number(this.createForm.totalPrice || 0);
      if (total > available + 0.0001) {
        const fmtTotal = total.toLocaleString('es-MX', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const fmtAvail = available.toLocaleString('es-MX', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        this.createError = `No se puede registrar la operación: el monto ($${fmtTotal} MXN) supera la caja disponible ($${fmtAvail} MXN).`;
        return;
      }
    }

    const payload: CreateOperationDto = {
      type: this.createForm.type,
      name: this.createForm.name.trim(),
      symbol: this.showsSymbolField() ? this.createForm.symbol.trim().toUpperCase() : null,
      date: this.createForm.date
        ? new Date(this.createForm.date).toISOString()
        : new Date().toISOString(),
      qty: this.isTradeType() ? Number(this.createForm.qty) : 1,
      totalPrice: Number(this.createForm.totalPrice),
    };

    this.isSubmittingCreate = true;
    this.operationsService.createOperation(payload).subscribe({
      next: () => {
        this.isSubmittingCreate = false;
        this.showCreateModal = false;
        this.loadData();
      },
      error: (err) => {
        this.isSubmittingCreate = false;
        if (err.status === 0) {
          this.createError = 'No se pudo conectar con el servidor backend.';
        } else if (err.status === 401) {
          this.createError = 'Sesión expirada o no autorizada. Inicia sesión nuevamente.';
        } else if (err.status === 404) {
          this.createError = 'El servicio de operaciones no está disponible (404).';
        } else if (typeof err.error === 'string') {
          this.createError = err.error;
        } else {
          this.createError =
            err.error?.message ||
            err.error?.error?.message ||
            'No se pudo registrar la operación. Revisa los datos ingresados.';
        }
        this.cd.markForCheck();
      },
    });
  }

  // DELETE OPERATION
  openDeleteModal(op: Operation): void {
    this.operationToDelete = op;
    this.deleteError = '';
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    if (!this.isSubmittingDelete) {
      this.showDeleteModal = false;
      this.operationToDelete = null;
      this.deleteError = '';
    }
  }

  confirmDelete(): void {
    if (!this.operationToDelete) return;

    this.isSubmittingDelete = true;
    this.deleteError = '';

    this.operationsService.deleteOperation(this.operationToDelete.id).subscribe({
      next: () => {
        this.isSubmittingDelete = false;
        this.showDeleteModal = false;
        this.operationToDelete = null;
        this.loadData();
      },
      error: (err) => {
        this.isSubmittingDelete = false;
        this.deleteError = err.error?.message || 'No se pudo eliminar la operación.';
        this.cd.markForCheck();
      },
    });
  }

  // EXPORT
  async exportExcel(): Promise<void> {
    if (this.operations.length === 0) return;
    try {
      await this.exportService.exportToExcel(
        this.operations,
        this.summary,
        this.getFilterDescription(),
      );
    } catch (e) {
      console.error('Error exportando Excel:', e);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.operations.length === 0) return;
    try {
      await this.exportService.exportToPdf(
        this.operations,
        this.summary,
        this.getFilterDescription(),
      );
    } catch (e) {
      console.error('Error exportando PDF:', e);
    }
  }

  // HELPERS
  getTodayDateString(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  getEstimatedUnitPrice(): number {
    const qty = this.createForm.qty || 1;
    const total = this.createForm.totalPrice || 0;
    return qty > 0 ? total / qty : 0;
  }

  getPerformanceVsNeutral(): {
    diff: number;
    percent: number;
    status: 'positive' | 'negative' | 'neutral';
  } {
    const diff = Math.round((this.summary.patrimonio - this.summary.neutral) * 100) / 100;
    const percent = this.summary.neutral > 0 ? (diff / this.summary.neutral) * 100 : 0;

    if (diff > 0.001) return { diff, percent, status: 'positive' };
    if (diff < -0.001) return { diff, percent, status: 'negative' };
    return { diff: 0, percent: 0, status: 'neutral' };
  }

  getTagClass(type: OperationType): string {
    switch (type) {
      case 'BUY':
        return 'tag--buy';
      case 'SELL':
        return 'tag--sell';
      case 'DIV':
        return 'tag--div';
      case 'DEP':
        return 'tag--dep';
      case 'RET':
        return 'tag--ret';
      case 'TAX':
        return 'tag--tax';
      default:
        return 'tag--neutral';
    }
  }

  getTypeLabel(type: OperationType): string {
    const map: Record<OperationType, string> = {
      BUY: 'Compra',
      SELL: 'Venta',
      DIV: 'Dividendo',
      DEP: 'Depósito',
      RET: 'Retiro',
      TAX: 'Impuesto',
    };
    return map[type] || type;
  }

  // CHART RENDERING
  private async renderChart(): Promise<void> {
    if (!this.isBrowser || !this.chartCanvas) return;

    const { Chart } = await import('chart.js/auto');

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    const sortedOps = [...this.allOperations].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const labels: string[] = [];
    const equityData: number[] = [];
    const neutralData: number[] = [];

    let runningCaja = 0;
    let runningNeutral = 0;
    const runningPosMap = new Map<string, { qty: number; cost: number }>();

    if (sortedOps.length === 0) {
      labels.push(new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }));
      equityData.push(0);
      neutralData.push(0);
    } else {
      for (const op of sortedOps) {
        const val = Number(op.totalPrice);
        switch (op.type) {
          case 'DEP':
            runningCaja += val;
            runningNeutral += val;
            break;
          case 'DIV':
          case 'SELL':
            runningCaja += val;
            break;
          case 'RET':
            runningCaja -= val;
            runningNeutral -= val;
            break;
          case 'BUY':
          case 'TAX':
            runningCaja -= val;
            break;
        }

        if (op.type === 'BUY' && op.symbol) {
          const p = runningPosMap.get(op.symbol) ?? { qty: 0, cost: 0 };
          p.qty += op.qty;
          p.cost += val;
          runningPosMap.set(op.symbol, p);
        } else if (op.type === 'SELL' && op.symbol) {
          const p = runningPosMap.get(op.symbol);
          if (p && p.qty > 0) {
            const avg = p.cost / p.qty;
            p.cost -= avg * op.qty;
            p.qty -= op.qty;
            if (p.qty <= 1e-6) {
              p.qty = 0;
              p.cost = 0;
            }
          }
        }

        let posCost = 0;
        for (const p of runningPosMap.values()) {
          posCost += p.cost;
        }

        const currentEquity = Math.round((runningCaja + posCost) * 100) / 100;
        const currentNeutral = Math.round(runningNeutral * 100) / 100;

        labels.push(
          new Date(op.date).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          }),
        );
        equityData.push(currentEquity);
        neutralData.push(currentNeutral);
      }
    }

    const lastEquity = equityData[equityData.length - 1] ?? 0;
    const lastNeutral = neutralData[neutralData.length - 1] ?? 0;
    const isAboveNeutral = lastEquity >= lastNeutral;

    const equityColor = isAboveNeutral ? '#3AB576' : '#D75B61';
    const equityBg = isAboveNeutral ? 'rgba(58, 181, 118, 0.12)' : 'rgba(215, 91, 97, 0.12)';

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Patrimonio total',
            data: equityData,
            borderColor: equityColor,
            backgroundColor: equityBg,
            fill: true,
            tension: 0.25,
            borderWidth: 2.5,
            pointBackgroundColor: equityColor,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Nivel neutral',
            data: neutralData,
            borderColor: '#71808C',
            borderDash: [5, 5],
            borderWidth: 1.8,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              font: {
                family: "'Inter', sans-serif",
                size: 12,
                weight: 500,
              },
              color: '#202C38',
            },
          },
          tooltip: {
            backgroundColor: '#202C38',
            titleFont: { family: "'Inter Tight', sans-serif", size: 12, weight: 600 },
            bodyFont: { family: "'Inter', sans-serif", size: 12 },
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (context: any) => {
                const val = context.parsed.y ?? 0;
                return ` ${context.dataset.label}: $${val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: '#E3E9ED',
            },
            ticks: {
              font: { family: "'Inter', sans-serif", size: 11 },
              color: '#71808C',
            },
          },
          y: {
            grid: {
              color: '#E3E9ED',
            },
            ticks: {
              font: { family: "'Inter', sans-serif", size: 11 },
              color: '#71808C',
              callback: (value: any) => `$${Number(value).toLocaleString('es-MX')}`,
            },
          },
        },
      },
    });
  }
}
