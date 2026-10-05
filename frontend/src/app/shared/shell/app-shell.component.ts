import {
  Component,
  OnInit,
  Inject,
  PLATFORM_ID,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService, User } from '../../core/services/auth.service';

export interface BreadcrumbItem {
  label: string;
  isBold?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent implements OnInit {
  currentUser: User | null = null;
  showProfileMenu = false;
  isSidebarCollapsed = false;
  breadcrumbs: BreadcrumbItem[] = [
    { label: 'GoBull' },
    { label: 'Cartera' },
    { label: 'Operaciones y Exportaciones', isBold: true },
  ];

  navigation = [
    { label: 'Inicio', icon: '⌂', route: '/dashboard' },
    { label: 'Operaciones', icon: '▣', route: '/dashboard' },
    { label: 'Noticias', icon: '▤', route: '/noticias' },
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private hostElement: ElementRef,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCurrentUser();
    }
    this.updateBreadcrumbs(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateBreadcrumbs(event.urlAfterRedirects);
        this.showProfileMenu = false;
      });
  }

  updateBreadcrumbs(url: string): void {
    if (url.startsWith('/noticias')) {
      this.breadcrumbs = [
        { label: 'GoBull' },
        { label: 'Noticias' },
        { label: 'Feed y Análisis de Mercado', isBold: true },
      ];
    } else {
      this.breadcrumbs = [
        { label: 'GoBull' },
        { label: 'Cartera' },
        { label: 'Operaciones y Exportaciones', isBold: true },
      ];
    }
  }

  loadCurrentUser(): void {
    this.authService.me().subscribe({
      next: (res) => {
        this.currentUser = res.user;
      },
      error: () => {
        // Redirigir a login si falla la sesión
        this.router.navigate(['/login']);
      },
    });
  }

  getUserInitials(): string {
    const name = (this.currentUser?.name || '').trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    const email = (this.currentUser?.email || '').trim();
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'GB';
  }

  toggleProfileMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showProfileMenu = !this.showProfileMenu;
  }

  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showProfileMenu && this.hostElement?.nativeElement) {
      const target = event.target as HTMLElement;
      if (!this.hostElement.nativeElement.querySelector('.profile-menu-container')?.contains(target)) {
        this.showProfileMenu = false;
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.showProfileMenu) {
      this.showProfileMenu = false;
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
}
