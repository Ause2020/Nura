/**
 * Contratos de persistencia fuera de HACCP: CAPA, monitoreo, auditoría.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const capa = read("components/capa/capa-workflow-panel.tsx");
const fiveWhys = read("components/capa/five-whys-form.tsx");
const executor = read("components/production-records/production-form-executor.tsx");
const digitalizar = read("components/production-records/digitalizar-view.tsx");
const qrForm = read("components/production-records/field-monitor-form.tsx");
const drawer = read("components/auditorias/finding-drawer.tsx");
const execute = read("components/auditorias/execute-audit.tsx");
const submit = read("lib/production-records/submit.ts");
const offline = read("lib/production-records/offline.ts");

test("CAPA guarda contención y fechas sin esperar avanzar", () => {
  assert.match(capa, /queueNcDraft/);
  assert.match(capa, /containment_description/);
  assert.match(capa, /visibilitychange/);
  assert.match(capa, /pagehide/);
});

test("5 Porqués persisten al tipear y muestran error si falla", () => {
  assert.match(fiveWhys, /persistWhysDebounced/);
  assert.match(fiveWhys, /No se pudo guardar/);
  assert.match(fiveWhys, /pagehide/);
});

test("monitoreo en planta encola si Enviar falla con red", () => {
  assert.match(executor, /queuePendingSubmission/);
  assert.match(executor, /setQueued\(true\)/);
  assert.match(executor, /syncQueuedProductionRecords/);
});

test("QR y OCR tienen cola local", () => {
  assert.match(offline, /QR_QUEUE_KEY/);
  assert.match(qrForm, /queuePendingQrSubmission/);
  assert.match(qrForm, /syncQueuedQrSubmissions/);
  assert.match(digitalizar, /source: "ocr"/);
  assert.match(digitalizar, /queuePendingSubmission/);
});

test("reintento de submission duplicada no pisa el registro", () => {
  assert.match(submit, /23505/);
  assert.match(submit, /client_submission_id/);
});

test("el cajón de hallazgo persiste al cerrar overlay", () => {
  assert.match(drawer, /persistAndClose/);
  assert.match(execute, /writeFindingDraft/);
  assert.match(execute, /visibilitychange/);
  assert.match(execute, /No se pudo guardar el ítem/);
});
