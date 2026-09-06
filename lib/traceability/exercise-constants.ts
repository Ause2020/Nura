export const EXERCISE_MAX_SECONDS = 4 * 60 * 60; // 4 hours

export const EXERCISE_TIMER_GREEN = "#00C896";
export const EXERCISE_TIMER_AMBER = "#F5A623";
export const EXERCISE_TIMER_RED = "#E53E3E";

export const EXERCISE_AMBER_THRESHOLD = 2 * 60 * 60; // 2h remaining
export const EXERCISE_RED_THRESHOLD = 30 * 60; // 30min remaining

export const EXERCISE_STORAGE_KEY = "nura-trace-exercise-v1";

export const EXERCISE_REASON_OPTIONS = [
  { value: "scheduled", label: "Simulacro programado" },
  { value: "internal_audit", label: "Auditoría interna" },
  { value: "external_audit", label: "Auditoría externa" },
  { value: "quality_alert", label: "Alerta de calidad" },
  { value: "product_withdrawal", label: "Retiro de producto" },
  { value: "other", label: "Otro" },
] as const;

export type ExerciseReason = (typeof EXERCISE_REASON_OPTIONS)[number]["value"];

export type StageStatus = "pending" | "in_progress" | "complete";

export interface RequiredDocument {
  id: string;
  label: string;
  normRef: string;
}

export interface ExerciseStageDefinition {
  id: string;
  emoji: string;
  name: string;
  documents: RequiredDocument[];
}

export const EXERCISE_STAGES: ExerciseStageDefinition[] = [
  {
    id: "raw_materials",
    emoji: "🌾",
    name: "Materias Primas",
    documents: [
      { id: "coa", label: "Certificado de Análisis (CoA) del proveedor", normRef: "BRCGS 3.4.2" },
      { id: "po", label: "Orden de compra / Albarán de entrada", normRef: "IFS 4.2" },
      { id: "supplier_lot", label: "Número de lote del proveedor", normRef: "BRCGS 3.9.1" },
      { id: "reception", label: "Registro de recepción y temperatura (si aplica)", normRef: "BRCGS 3.5" },
      { id: "supplier_approval", label: "Aprobación de proveedor vigente", normRef: "IFS 4.2.1" },
    ],
  },
  {
    id: "processing",
    emoji: "⚗️",
    name: "Elaboración / Proceso",
    documents: [
      { id: "batch_record", label: "Orden de producción / Batch record", normRef: "BRCGS 3.9.2" },
      { id: "process_params", label: "Registro de parámetros de proceso (tiempo, temperatura, presión)", normRef: "IFS 4.12" },
      { id: "ccp_record", label: "Registro de CCP (Puntos Críticos de Control)", normRef: "BRCGS 2.11" },
      { id: "mass_balance", label: "Balance de masas (cantidades entrada vs. salida)", normRef: "BRCGS 3.9.3" },
    ],
  },
  {
    id: "quality_control",
    emoji: "🧪",
    name: "Control de Calidad",
    documents: [
      { id: "internal_analysis", label: "Resultados de análisis internos del lote", normRef: "IFS 5.1" },
      { id: "micro_chem", label: "Resultados microbiológicos / fisicoquímicos", normRef: "BRCGS 3.10" },
      { id: "hold_deviation", label: "Registro de retenciones o desviaciones", normRef: "IFS 5.6" },
      { id: "lot_release", label: "Liberación del lote (firma / aprobación QA)", normRef: "BRCGS 3.9.4" },
    ],
  },
  {
    id: "packaging",
    emoji: "📦",
    name: "Envasado",
    documents: [
      { id: "packaging_materials", label: "Registro de materiales de envase (lote de envase primario y secundario)", normRef: "BRCGS 5.3" },
      { id: "line_clearance", label: "Checklist de línea (line clearance)", normRef: "IFS 4.12.3" },
      { id: "coding", label: "Registro de codificación / marcaje (fecha vencimiento, número de lote impreso)", normRef: "BRCGS 5.4" },
      { id: "weight_inspection", label: "Registro de pesos / inspección visual", normRef: "IFS 4.12.4" },
    ],
  },
  {
    id: "storage",
    emoji: "🏭",
    name: "Almacenamiento",
    documents: [
      { id: "location", label: "Registro de ubicación en bodega (posición / pallet / rack)", normRef: "BRCGS 4.14" },
      { id: "conditions", label: "Registro de condiciones de almacenamiento (temperatura, humedad)", normRef: "IFS 4.8" },
      { id: "fifo", label: "Evidencia de cumplimiento FIFO/FEFO", normRef: "BRCGS 4.14.2" },
    ],
  },
  {
    id: "logistics",
    emoji: "🚛",
    name: "Logística / Despacho",
    documents: [
      { id: "dispatch", label: "Guía de despacho / remisión", normRef: "BRCGS 3.9.5" },
      { id: "vehicle_temp", label: "Registro de condiciones del vehículo (temperatura pre-carga)", normRef: "IFS 4.15" },
      { id: "picking", label: "Lista de carga / picking list", normRef: "BRCGS 4.15" },
      { id: "signatures", label: "Firma de conductor y responsable de despacho", normRef: "IFS 4.15.2" },
    ],
  },
  {
    id: "distribution",
    emoji: "🚚",
    name: "Distribución",
    documents: [
      { id: "cold_chain", label: "Registro de cadena de frío en tránsito (si aplica)", normRef: "BRCGS 4.15.3" },
      { id: "pod", label: "Prueba de entrega (Proof of Delivery / POD)", normRef: "IFS 4.15" },
      { id: "vehicle_route", label: "Número de patente del vehículo y ruta", normRef: "BRCGS 3.9.6" },
    ],
  },
  {
    id: "sales",
    emoji: "🛒",
    name: "Ventas / Cliente Final",
    documents: [
      { id: "invoice", label: "Factura de venta / nota de entrega al cliente", normRef: "IFS 4.16" },
      { id: "customer_confirm", label: "Confirmación de recepción del cliente", normRef: "BRCGS 3.9.7" },
      { id: "returns", label: "Reclamos o devoluciones asociados al lote (si los hubiera)", normRef: "IFS 5.8" },
    ],
  },
];

export const ACCEPTED_FILE_EXTENSIONS = [
  ".pdf",
  ".xlsx",
  ".xls",
  ".docx",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
];

export const ACCEPTED_FILE_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "image/jpeg",
  "image/png",
];

export const MASS_BALANCE_UNITS = ["kg", "L", "unidades"] as const;

export type MassBalanceUnit = (typeof MASS_BALANCE_UNITS)[number];

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: "PENDIENTE",
  in_progress: "EN CURSO",
  complete: "COMPLETA",
};
