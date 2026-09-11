/**
 * Controles de exportación spreadsheet: formula/CSV injection, límites,
 * ausencia de parser de archivos de usuario.
 *
 *   node --test scripts/verify-spreadsheet-export.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  MAX_CELL_CHARS,
  MAX_COLUMNS,
  MAX_ROWS,
  MAX_SHEETS,
  assertExportLimits,
  buildCsvString,
  buildXlsxBuffer,
  sanitizeDownloadFilename,
  sanitizeSheetName,
  sanitizeSpreadsheetCell,
  toCsvField,
} from "../lib/export/spreadsheet-sanitize.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const ADVERSARIAL_CELLS = [
  "=1+1",
  "=cmd|'/c calc'!A0",
  "=CMD|'/C powershell IEX'!A0",
  "+2+3",
  "-2+3",
  "@SUM(A1:A2)",
  "\t=1+1",
  "\r=1+1",
  " =HYPERLINK(\"http://evil.example\",\"click\")",
  "＝1+1",
  "|cmd",
  "%cmd",
  "=DDE(\"cmd\",\"/c calc\",\"\")",
  "-=1+1",
  "@SUM(1+1)",
];

function walkSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".next-verify" ||
      entry === ".git"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkSourceFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

test("xlsx@0.18.5 no está en package.json ni package-lock", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const lock = readFileSync(join(ROOT, "package-lock.json"), "utf8");
  assert.equal(pkg.dependencies.xlsx, undefined);
  assert.equal(pkg.devDependencies?.xlsx, undefined);
  assert.equal(lock.includes("\"xlsx\""), false);
  assert.equal(pkg.dependencies.exceljs, "^4.4.0");
});

test("el código de aplicación no parsea spreadsheets de usuario", () => {
  const files = walkSourceFiles(join(ROOT, "app"))
    .concat(walkSourceFiles(join(ROOT, "components")))
    .concat(walkSourceFiles(join(ROOT, "lib")));

  const forbidden = [
    /from\s+["']xlsx["']/,
    /require\(\s*["']xlsx["']\s*\)/,
    /XLSX\.read/,
    /XLSX\.write/,
    /\.xlsx\.load\s*\(/,
    /\.csv\.read\s*\(/,
    /workbook\.xlsx\.read/,
  ];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(src),
        false,
        `${file} contiene parser prohibido: ${pattern}`
      );
    }
  }
});

test("neutraliza fórmulas y DDE clásicos (CSV injection)", () => {
  for (const payload of ADVERSARIAL_CELLS) {
    const sanitized = sanitizeSpreadsheetCell(payload);
    assert.equal(typeof sanitized, "string");
    assert.equal(String(sanitized).startsWith("'"), true, `no saneó: ${JSON.stringify(payload)}`);
    assert.equal(String(sanitized).includes("=cmd") && !String(sanitized).startsWith("'"), false);
  }
});

test("no altera números finitos ni texto inocuo", () => {
  assert.equal(sanitizeSpreadsheetCell(42), 42);
  assert.equal(sanitizeSpreadsheetCell(-5), -5);
  assert.equal(sanitizeSpreadsheetCell(0), 0);
  assert.equal(sanitizeSpreadsheetCell("Lote ABC-12"), "Lote ABC-12");
  assert.equal(sanitizeSpreadsheetCell("3.14"), "3.14");
  assert.equal(sanitizeSpreadsheetCell(null), "");
  assert.equal(sanitizeSpreadsheetCell(undefined), "");
});

test("bloquea objetos fórmula de ExcelJS", () => {
  const sanitized = sanitizeSpreadsheetCell({ formula: "SUM(A1:A2)", result: 3 });
  assert.equal(sanitized, 3);
  const blocked = sanitizeSpreadsheetCell({ formula: "cmd|'/c calc'!A0" });
  assert.equal(blocked, "[formula blocked]");
  assert.equal(String(blocked).includes("cmd|"), false);
});

test("trunca celdas excesivamente largas", () => {
  const huge = `=${"A".repeat(MAX_CELL_CHARS + 50)}`;
  const sanitized = String(sanitizeSpreadsheetCell(huge));
  assert.ok(sanitized.length <= MAX_CELL_CHARS + 1);
});

test("CSV escapa comillas y prefija fórmulas", () => {
  const csv = buildCsvString(
    [{ header: "Notas" }, { header: "=1+1" }],
    [
      ["ok", "hola"],
      ["=cmd|'/c calc'!A0", 'dijo "hola"'],
      ["+1+1", "-2+3"],
    ]
  );

  const lines = csv.split("\n");
  assert.equal(lines[0].startsWith("Notas,"), true);
  assert.equal(lines[0].includes("'=1+1"), true);
  assert.equal(lines[1], "ok,hola");
  assert.match(lines[2], /^'=cmd\|'\/c calc'!A0/);
  assert.match(lines[2], /"dijo ""hola"""/);
  assert.equal(lines[3], "'+1+1,'-2+3");
  assert.equal(csv.includes("\n=cmd"), false);
  assert.equal(toCsvField("a,b"), '"a,b"');
});

test("CSV rechaza demasiadas filas o columnas", () => {
  assert.throws(() =>
    buildCsvString(
      Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => ({ header: String(i) })),
      []
    )
  );
  assert.throws(() =>
    buildCsvString([{ header: "A" }], Array.from({ length: MAX_ROWS + 1 }, () => ["x"]))
  );
});

test("límites de workbook se aplican antes de escribir", () => {
  assert.throws(() => assertExportLimits([]));
  assert.throws(() =>
    assertExportLimits(
      Array.from({ length: MAX_SHEETS + 1 }, (_, i) => ({
        name: `s${i}`,
        columns: [],
        rows: [],
      }))
    )
  );
});

test("nombres de hoja y archivo no aceptan path ni fórmula", () => {
  const used = new Set();
  assert.equal(sanitizeSheetName("=cmd", used).startsWith("H"), true);
  assert.equal(sanitizeSheetName("Hoja:1/A", new Set()).includes(":"), false);
  assert.equal(sanitizeDownloadFilename("../etc/passwd"), "..-etc-passwd");
  assert.equal(sanitizeDownloadFilename("a\nb"), "ab");
});

test("XLSX generado no contiene celdas fórmula", async () => {
  const buf = await buildXlsxBuffer({
    filename: "test",
    sheets: [
      {
        name: "Hallazgos",
        columns: [{ header: "Descripción" }, { header: "Notas" }],
        rows: ADVERSARIAL_CELLS.map((payload) => [payload, "Lote-01"]),
      },
    ],
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf);
  const ws = workbook.worksheets[0];
  assert.ok(ws);

  ws.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      const isFormula =
        cell.type === ExcelJS.ValueType.Formula ||
        (cell.value && typeof cell.value === "object" && "formula" in cell.value);
      assert.equal(isFormula, false, `fórmula en fila ${rowNumber}: ${JSON.stringify(cell.value)}`);

      if (typeof cell.value === "string" && looksUnsafe(cell.value)) {
        assert.equal(cell.value.startsWith("'"), true, `celda insegura: ${cell.value}`);
      }
    });
  });
});

function looksUnsafe(value) {
  return /^[']?[=+\-@]/.test(value.replace(/^[\uFEFF\s]+/, "")) || value.includes("cmd|");
}

test("archivo CSV hostil no se interpreta como datos de Nura", () => {
  const hostileCsv = ["name,notes", "=cmd|'/c calc'!A0,ok", "+2+3,@SUM(1+1)"].join("\n");
  assert.match(hostileCsv, /^=cmd/m);

  const exported = buildCsvString(
    [{ header: "name" }, { header: "notes" }],
    [
      ["=cmd|'/c calc'!A0", "ok"],
      ["+2+3", "@SUM(1+1)"],
    ]
  );

  for (const line of exported.split("\n").slice(1)) {
    const first = line.split(",")[0];
    assert.equal(first.startsWith("'"), true, line);
  }
});

test("simulacro de xlsx malicioso (PK zip + fórmula) no se carga en app", () => {
  const fakeXlsx = Buffer.from("PK\u0003\u0004formula=cmd|'/c calc'!A0", "binary");
  assert.equal(fakeXlsx[0], 0x50);
  assert.equal(fakeXlsx[1], 0x4b);

  const files = walkSourceFiles(join(ROOT, "lib")).concat(
    walkSourceFiles(join(ROOT, "app")),
    walkSourceFiles(join(ROOT, "components"))
  );
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(src.includes("xlsx.load"), false, file);
    assert.equal(src.includes("XLSX.read"), false, file);
  }

});
