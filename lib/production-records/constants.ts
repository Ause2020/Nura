import type { ProductionFieldType } from "@/types/database";

export const PRODUCTION_FIELD_TYPES: {
  value: ProductionFieldType;
  label: string;
}[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "select", label: "Selección única" },
  { value: "multiselect", label: "Selección múltiple" },
  { value: "datetime", label: "Fecha / hora" },
  { value: "photo", label: "Foto" },
  { value: "checklist", label: "Checklist Sí/No/N.A." },
];

export const SUBMISSION_STATUS_LABELS = {
  ok: "Conforme",
  deviation: "Con desviación",
  pending_sync: "Pendiente de sincronizar",
} as const;

export const SYNC_STATUS_LABELS = {
  synced: "Sincronizado",
  pending_sync: "Pendiente de sincronizar",
} as const;

export const CHECKLIST_OPTIONS = [
  { value: "yes", label: "Sí" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
] as const;

export const PHOTOS_BUCKET = "production-record-photos";
