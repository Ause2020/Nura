import type {
  SupplierCategory,
  SupplierCriticality,
  SupplierDocType,
  SupplierIncidentType,
  SupplierStatus,
} from "@/types/database";

export const SUPPLIER_CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: "raw_material", label: "Materia prima" },
  { value: "packaging", label: "Empaque" },
  { value: "service", label: "Servicio" },
  { value: "equipment", label: "Equipamiento" },
  { value: "other", label: "Otro" },
];

export const SUPPLIER_CRITICALITIES: {
  value: SupplierCriticality;
  label: string;
}[] = [
  { value: "critical", label: "Crítico" },
  { value: "major", label: "Mayor" },
  { value: "minor", label: "Menor" },
];

export const SUPPLIER_STATUSES: { value: SupplierStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "in_evaluation", label: "En evaluación" },
  { value: "approved", label: "Aprobado" },
  { value: "conditional", label: "Condicional" },
  { value: "suspended", label: "Suspendido" },
];

export const DOC_TYPES: { value: SupplierDocType; label: string }[] = [
  { value: "sanitary_certificate", label: "Certificado sanitario" },
  { value: "haccp_cert", label: "Certificado HACCP" },
  { value: "iso_cert", label: "Certificado ISO" },
  { value: "analysis_report", label: "Informe de análisis" },
  { value: "technical_sheet", label: "Ficha técnica" },
  { value: "other", label: "Otro" },
];

export const INCIDENT_TYPES: { value: SupplierIncidentType; label: string }[] = [
  { value: "quality", label: "Calidad" },
  { value: "delivery", label: "Entrega" },
  { value: "safety", label: "Inocuidad" },
  { value: "documentation", label: "Documentación" },
  { value: "other", label: "Otro" },
];

export const CLASSIFICATION_LABELS: Record<string, string> = {
  A: "Preferente",
  B: "Aceptable",
  C: "En observación",
};

export function getCategoryLabel(v: SupplierCategory): string {
  return SUPPLIER_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

export function getCriticalityLabel(v: SupplierCriticality): string {
  return SUPPLIER_CRITICALITIES.find((c) => c.value === v)?.label ?? v;
}

export function getStatusLabel(v: SupplierStatus): string {
  return SUPPLIER_STATUSES.find((s) => s.value === v)?.label ?? v;
}

export function getDocTypeLabel(v: SupplierDocType): string {
  return DOC_TYPES.find((d) => d.value === v)?.label ?? v;
}

export function getIncidentTypeLabel(v: SupplierIncidentType): string {
  return INCIDENT_TYPES.find((i) => i.value === v)?.label ?? v;
}
