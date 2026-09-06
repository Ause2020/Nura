import { getCatalogTemplate } from "@/lib/audit/catalog";
import type {
  AuditChecklistResult,
  AuditStandard,
  AuditStatus,
  AuditType,
  FindingType,
} from "@/types/database";

export const AUDIT_TYPE_OPTIONS: { value: AuditType; label: string }[] = [
  { value: "internal", label: "Interna" },
  { value: "external", label: "Externa" },
  { value: "supplier", label: "Proveedor" },
  { value: "regulatory", label: "Regulatoria" },
];

export const AUDIT_STANDARD_OPTIONS: { value: AuditStandard; label: string }[] = [
  { value: "haccp_codex", label: "HACCP Codex" },
  { value: "iso22000", label: "ISO 22000:2018" },
  { value: "fssc22000", label: "FSSC 22000" },
  { value: "brc", label: "BRC / BRCGS" },
  { value: "fda_fsma", label: "FDA FSMA" },
  { value: "custom", label: "Personalizada" },
];

export const STATUS_LABELS: Record<AuditStatus, string> = {
  scheduled: "Programada",
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const RESULT_LABELS: Record<AuditChecklistResult, string> = {
  complies: "Cumple",
  not_complies: "No cumple",
  partial: "Parcial",
  na: "N/A",
  not_evaluated: "Sin evaluar",
};

export const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  major_nc: "NC Mayor",
  minor_nc: "NC Menor",
  observation: "Observación",
  opportunity: "Oportunidad de mejora",
};

export function getAuditTypeLabel(type: AuditType): string {
  return AUDIT_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

export function getStandardLabel(standard: AuditStandard | string): string {
  const official = AUDIT_STANDARD_OPTIONS.find((s) => s.value === standard)?.label;
  if (official) return official;
  const catalog = getCatalogTemplate(standard);
  return catalog?.name ?? standard;
}

export function getStatusBadgeVariant(
  status: AuditStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  if (status === "cancelled") return "neutral";
  return "neutral";
}

export function getStatusTrafficColor(status: AuditStatus): string {
  if (status === "completed") return "bg-sage";
  if (status === "in_progress") return "bg-amber";
  if (status === "cancelled") return "bg-ink-faint";
  return "bg-sage";
}
