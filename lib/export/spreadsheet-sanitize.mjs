/**
 * Saneo write-only para CSV/XLSX.
 * Nura no parsea archivos de usuario. Estas funciones evitan CSV/formula injection
 * cuando se exportan datos que un usuario pudo introducir (=, +, -, @, DDE, etc.).
 */

export const MAX_SHEETS = 20;
export const MAX_COLUMNS = 50;
export const MAX_ROWS = 10_000;
export const MAX_CELL_CHARS = 8_000;

const FORMULA_PREFIX = /^[=+\-@\t\r|%]/;
const LEADING_NOISE = /^[\uFEFF\u200B\u200C\u200D\u2060\s]+/;
const HOMOGLYPH_PREFIX = /^[\uFF1D\uFF0B\uFF20\u2212\uFE36\uFF1C\uFF1E]/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeFormula(value) {
  const raw = String(value ?? "");
  const trimmed = raw.replace(LEADING_NOISE, "");
  if (!trimmed) return false;
  return FORMULA_PREFIX.test(trimmed) || HOMOGLYPH_PREFIX.test(trimmed);
}

/**
 * Neutraliza payloads de CSV/formula injection. Los números finitos se dejan
 * como número (Excel no los ejecuta como fórmula).
 *
 * @param {unknown} value
 * @returns {string | number}
 */
export function sanitizeSpreadsheetCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "formula" in value) {
    return sanitizeSpreadsheetCell(
      /** @type {{ result?: unknown }} */ (value).result ?? "[formula blocked]"
    );
  }

  if (value && typeof value === "object") {
    try {
      return sanitizeSpreadsheetCell(JSON.stringify(value));
    } catch {
      return "";
    }
  }

  let text = value === null || value === undefined ? "" : String(value);
  if (text.length > MAX_CELL_CHARS) {
    text = text.slice(0, MAX_CELL_CHARS);
  }

  if (looksLikeFormula(text)) {
    return `'${text}`;
  }
  return text;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function toCsvField(value) {
  const sanitized = String(sanitizeSpreadsheetCell(value));
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replaceAll('"', '""')}"`;
  }
  return sanitized;
}

/**
 * @param {{ header: string }[]} columns
 * @param {(string | number | null | undefined)[][]} rows
 * @returns {string}
 */
export function buildCsvString(columns, rows) {
  if (columns.length > MAX_COLUMNS) {
    throw new Error(`Máximo ${MAX_COLUMNS} columnas por hoja`);
  }
  if (rows.length > MAX_ROWS) {
    throw new Error(`Máximo ${MAX_ROWS} filas por hoja`);
  }

  const header = columns.map((column) => toCsvField(column.header));
  const body = rows.map((row) => row.map((cell) => toCsvField(cell)).join(","));
  return [header.join(","), ...body].join("\n");
}

/**
 * @param {string} name
 * @returns {string}
 */
export function sanitizeDownloadFilename(name) {
  const cleaned = String(name ?? "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "export";
}

/**
 * @param {string} name
 * @param {Set<string>} used
 * @returns {string}
 */
export function sanitizeSheetName(name, used) {
  let cleaned =
    String(name ?? "")
      .replace(/[:\\/?*[\]]/g, " ")
      .trim()
      .slice(0, 31) || "Hoja";

  if (looksLikeFormula(cleaned)) {
    cleaned = `H${cleaned}`.slice(0, 31);
  }

  let candidate = cleaned;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = ` (${i})`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * @param {{ name: string, columns: unknown[], rows: unknown[] }[]} sheets
 */
export function assertExportLimits(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("No hay hojas para exportar");
  }
  if (sheets.length > MAX_SHEETS) {
    throw new Error(`Máximo ${MAX_SHEETS} hojas por archivo`);
  }
  for (const sheet of sheets) {
    if (sheet.columns.length > MAX_COLUMNS) {
      throw new Error(`Máximo ${MAX_COLUMNS} columnas por hoja`);
    }
    if (sheet.rows.length > MAX_ROWS) {
      throw new Error(`Máximo ${MAX_ROWS} filas por hoja`);
    }
  }
}

/**
 * Write-only. Nunca llama load/read sobre input de usuario.
 *
 * @param {{ filename?: string, sheets: { name: string, columns: { header: string, width?: number }[], rows: (string|number|null|undefined)[][] }[] }} options
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildXlsxBuffer(options) {
  assertExportLimits(options.sheets);

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nura";
  workbook.calcProperties = { fullCalcOnLoad: false };

  const usedNames = new Set();

  for (const sheet of options.sheets) {
    const ws = workbook.addWorksheet(sanitizeSheetName(sheet.name, usedNames));
    ws.columns = sheet.columns.map((column) => ({
      header: String(sanitizeSpreadsheetCell(column.header)),
      width: column.width ?? 22,
    }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.value = sanitizeSpreadsheetCell(cell.value);
      if (typeof cell.value === "string") {
        cell.numFmt = "@";
      }
    });

    for (const row of sheet.rows) {
      const values = row.map((value) => sanitizeSpreadsheetCell(value));
      const added = ws.addRow(values);
      added.eachCell((cell) => {
        if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
          cell.value = sanitizeSpreadsheetCell("[formula blocked]");
        }
        if (typeof cell.value === "string") {
          cell.numFmt = "@";
        }
      });
    }

    if (sheet.columns.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buf = await workbook.xlsx.writeBuffer();
  return buf;
}
