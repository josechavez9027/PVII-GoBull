import { Injectable } from '@angular/core';
import { CapitalSummary, Operation } from './operations.service';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  /**
   * Export operations to Excel (.xlsx) file
   */
  async exportToExcel(
    operations: Operation[],
    summary: CapitalSummary,
    filterDescription: string = 'Todas las operaciones',
  ): Promise<void> {
    const XLSX = await import('xlsx');

    const formattedRows = operations.map((op) => [
      op.type,
      op.name,
      op.symbol ?? '—',
      new Date(op.date).toLocaleDateString('es-MX'),
      op.qty,
      Number((op.totalPrice / op.qty).toFixed(2)),
      Number(op.totalPrice.toFixed(2)),
    ]);

    const header = [
      ['GOBULL - REPORTE DE OPERACIONES'],
      [`Fecha de exportación: ${new Date().toLocaleString('es-MX')}`],
      [`Filtros: ${filterDescription}`],
      [],
      ['Tipo', 'Nombre', 'Símbolo', 'Fecha', 'Cantidad', 'Precio Unitario (MXN)', 'Total (MXN)'],
      ...formattedRows,
      [],
      ['RESUMEN DE CAPITAL', '', '', '', '', '', ''],
      ['Caja disponible (MXN)', '', '', '', '', '', Number(summary.caja.toFixed(2))],
      ['Patrimonio total (MXN)', '', '', '', '', '', Number(summary.patrimonio.toFixed(2))],
      ['Nivel neutral (MXN)', '', '', '', '', '', Number(summary.neutral.toFixed(2))],
    ];

    const ws = XLSX.utils.aoa_to_sheet(header);

    // Column widths
    ws['!cols'] = [
      { wch: 10 },
      { wch: 26 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 22 },
      { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operaciones');

    const fileName = `GoBull_Operaciones_${this.getDateStamp()}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  /**
   * Export operations to PDF (.pdf) file
   */
  async exportToPdf(
    operations: Operation[],
    summary: CapitalSummary,
    filterDescription: string = 'Todas las operaciones',
  ): Promise<void> {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');

    const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;

    if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) {
      pdfMake.vfs = pdfFonts.pdfMake.vfs;
    } else if (pdfFonts && (pdfFonts as any).vfs) {
      pdfMake.vfs = (pdfFonts as any).vfs;
    }

    const tableBody = [
      [
        { text: 'Tipo', style: 'tableHeader' },
        { text: 'Nombre', style: 'tableHeader' },
        { text: 'Símbolo', style: 'tableHeader' },
        { text: 'Fecha', style: 'tableHeader' },
        { text: 'Cantidad', style: 'tableHeader', alignment: 'right' },
        { text: 'P. Unitario', style: 'tableHeader', alignment: 'right' },
        { text: 'Total (MXN)', style: 'tableHeader', alignment: 'right' },
      ],
      ...operations.map((op) => [
        { text: op.type, style: 'tableCell', bold: true },
        { text: op.name, style: 'tableCell' },
        { text: op.symbol ?? '—', style: 'tableCell' },
        { text: new Date(op.date).toLocaleDateString('es-MX'), style: 'tableCell' },
        { text: op.qty.toString(), style: 'tableCell', alignment: 'right' },
        {
          text: `$${(op.totalPrice / op.qty).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          style: 'tableCell',
          alignment: 'right',
        },
        {
          text: `$${op.totalPrice.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          style: 'tableCell',
          alignment: 'right',
        },
      ]),
    ];

    const docDefinition: any = {
      content: [
        {
          columns: [
            {
              text: [
                { text: 'Go', color: '#087DC9', fontSize: 22, bold: true },
                { text: 'Bull', color: '#3AB576', fontSize: 22, bold: true },
              ],
            },
            {
              text: `Reporte de Operaciones\nGenerado: ${new Date().toLocaleString('es-MX')}`,
              alignment: 'right',
              fontSize: 10,
              color: '#576670',
            },
          ],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 10,
              x2: 515,
              y2: 10,
              lineWidth: 1.5,
              lineColor: '#087DC9',
            },
          ],
          margin: [0, 5, 0, 15],
        },
        {
          text: `Filtros aplicados: ${filterDescription}`,
          fontSize: 10,
          color: '#71808C',
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
            vLineWidth: () => 0,
            hLineColor: (i: number) => (i === 1 ? '#087DC9' : '#E3E9ED'),
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
        },
        {
          margin: [0, 20, 0, 0],
          columns: [
            { width: '*', text: '' },
            {
              width: 220,
              table: {
                body: [
                  [
                    { text: 'Caja disponible:', bold: true, fontSize: 10, color: '#202C38' },
                    {
                      text: `$${summary.caja.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
                      alignment: 'right',
                      bold: true,
                      fontSize: 10,
                    },
                  ],
                  [
                    { text: 'Patrimonio total:', bold: true, fontSize: 10, color: '#202C38' },
                    {
                      text: `$${summary.patrimonio.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
                      alignment: 'right',
                      bold: true,
                      fontSize: 10,
                      color: '#087DC9',
                    },
                  ],
                  [
                    { text: 'Nivel neutral:', bold: true, fontSize: 10, color: '#71808C' },
                    {
                      text: `$${summary.neutral.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
                      alignment: 'right',
                      fontSize: 10,
                      color: '#71808C',
                    },
                  ],
                ],
              },
              layout: 'lightHorizontalLines',
            },
          ],
        },
      ],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 9,
          color: '#202C38',
          fillColor: '#F5F7F9',
        },
        tableCell: {
          fontSize: 8.5,
          color: '#576670',
        },
      },
      defaultStyle: {
        fontSize: 9,
      },
    };

    pdfMake.createPdf(docDefinition).download(`GoBull_Operaciones_${this.getDateStamp()}.pdf`);
  }

  private getDateStamp(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}
