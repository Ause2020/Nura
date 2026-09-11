export const MAX_SHEETS: number;
export const MAX_COLUMNS: number;
export const MAX_ROWS: number;
export const MAX_CELL_CHARS: number;

export function sanitizeSpreadsheetCell(value: unknown): string | number;
export function toCsvField(value: unknown): string;
export function buildCsvString(
  columns: { header: string }[],
  rows: (string | number | null | undefined)[][]
): string;
export function sanitizeDownloadFilename(name: string): string;
export function sanitizeSheetName(name: string, used: Set<string>): string;
export function assertExportLimits(
  sheets: { name: string; columns: unknown[]; rows: unknown[] }[]
): void;

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
  filename?: string;
  sheets: ExcelSheet[];
}

export function buildXlsxBuffer(options: ExcelExportOptions): Promise<ArrayBuffer>;
