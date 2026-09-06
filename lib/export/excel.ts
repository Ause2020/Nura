/**
 * Reusable Excel/CSV export helper.
 *
 * Usage:
 *   const { downloadExcel } = await import("@/lib/export/excel");
 *   await downloadExcel({ filename: "hallazgos", sheets: [{ name: "Hallazgos", rows }] });
 *
 * Compatible with any module — just pass columns + rows.
 * Handles download client-side; no server/API needed.
 */

export interface ExcelColumn {
  header: string;
  /** Width in characters (default 20) */
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: (string | number | null | undefined)[][];
}

export interface ExcelExportOptions {
  /** File name without extension */
  filename: string;
  sheets: ExcelSheet[];
}

export async function downloadExcel(options: ExcelExportOptions): Promise<void> {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  for (const sheet of options.sheets) {
    // Build data: header row + data rows
    const headers = sheet.columns.map((c) => c.header);
    const data = [headers, ...sheet.rows.map((row) => row.map((v) => v ?? ""))];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws["!cols"] = sheet.columns.map((c) => ({ wch: c.width ?? 22 }));

    // Freeze top row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    // AutoFilter on header row
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  triggerDownload(blob, `${options.filename}.xlsx`);
}

export async function downloadCsv(
  filename: string,
  columns: ExcelColumn[],
  rows: (string | number | null | undefined)[][]
): Promise<void> {
  const headers = columns.map((c) => c.header);
  const csvRows = [headers, ...rows.map((row) => row.map((v) => v ?? ""))];
  const csv = csvRows
    .map((row) =>
      row
        .map((v) => {
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replaceAll('"', '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}.csv`);
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
