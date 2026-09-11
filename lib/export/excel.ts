/**
 * Exportación Excel/CSV write-only.
 * No parsea archivos de usuario. Reemplaza sheetjs/xlsx@0.18.5
 * (CVE-2023-30533, CVE-2024-22363).
 *
 * Los valores de usuario se sanean contra CSV/formula injection antes de escribir.
 */

import {
  buildCsvString,
  buildXlsxBuffer,
  sanitizeDownloadFilename,
} from "./spreadsheet-sanitize.mjs";

export interface ExcelColumn {
  header: string;
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: (string | number | null | undefined)[][];
}

export interface ExcelExportOptions {
  filename: string;
  sheets: ExcelSheet[];
}

export async function downloadExcel(options: ExcelExportOptions): Promise<void> {
  const buf = await buildXlsxBuffer(options);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `${sanitizeDownloadFilename(options.filename)}.xlsx`);
}

export async function downloadCsv(
  filename: string,
  columns: ExcelColumn[],
  rows: (string | number | null | undefined)[][]
): Promise<void> {
  const csv = buildCsvString(columns, rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${sanitizeDownloadFilename(filename)}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
