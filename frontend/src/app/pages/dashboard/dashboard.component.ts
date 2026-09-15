import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  protected readonly navigation = [
    { label: 'Inicio', icon: '⌂', active: true },
    { label: 'Operaciones', icon: '▣' },
    { label: 'Reportes', icon: '▤' },
    { label: 'Noticias', icon: '▤' },
  ];
}
