import type { CapaActionType, NcOrigin, NcSeverity, NcStatus } from "@/types/database";
import {
  AlertTriangle,
  Beaker,
  ClipboardList,
  Factory,
  MessageSquare,
  Search,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

export const NC_ORIGIN_OPTIONS: {
  value: NcOrigin;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "prp", label: "PRP", icon: ClipboardList },
  { value: "audit", label: "Auditoría", icon: Search },
  { value: "process", label: "Proceso", icon: Factory },
  { value: "production_record", label: "Monitoreo", icon: Factory },
  { value: "lab", label: "Laboratorio", icon: Beaker },
  { value: "complaint", label: "Reclamo", icon: MessageSquare },
  { value: "inspection", label: "Inspección", icon: ShieldCheck },
  { value: "supplier", label: "Proveedor", icon: Truck },
  { value: "other", label: "Otro", icon: AlertTriangle },
];

export const NC_ORIGIN_CREATE_OPTIONS = NC_ORIGIN_OPTIONS.filter((o) =>
  ["process", "production_record", "audit", "other"].includes(o.value)
);

export const SEVERITY_OPTIONS: {
  value: NcSeverity;
  label: string;
  description: string;
  days: number;
}[] = [
  {
    value: "critical",
    label: "Crítica",
    description: "Riesgo directo para la inocuidad",
    days: 3,
  },
  {
    value: "major",
    label: "Mayor",
    description: "Incumplimiento normativo significativo",
    days: 7,
  },
  {
    value: "minor",
    label: "Menor",
    description: "Desviación controlable",
    days: 30,
  },
  {
    value: "observation",
    label: "Observación",
    description: "Oportunidad de mejora",
    days: 30,
  },
];

export const STATUS_LABELS: Record<NcStatus, string> = {
  open: "Abierta",
  in_analysis: "En análisis",
  in_progress: "En progreso",
  pending_verification: "Pendiente verificación",
  closed: "Cerrada",
  overdue: "Vencida",
};

export const ACTION_TYPE_LABELS: Record<CapaActionType, string> = {
  immediate: "Inmediata",
  corrective: "Correctiva",
  preventive: "Preventiva",
};

export const FISHBONE_CATEGORIES = [
  { value: "machine", label: "Máquina" },
  { value: "method", label: "Método" },
  { value: "material", label: "Material" },
  { value: "manpower", label: "Mano de obra" },
  { value: "environment", label: "Medio ambiente" },
  { value: "measurement", label: "Medición" },
] as const;

export type FishboneCategory = (typeof FISHBONE_CATEGORIES)[number]["value"];

export const OPEN_STATUSES: NcStatus[] = ["open", "in_analysis"];
export const IN_PROGRESS_STATUSES: NcStatus[] = [
  "in_progress",
  "pending_verification",
  "overdue",
];
export const CLOSED_STATUSES: NcStatus[] = ["closed"];

export function getOriginLabel(origin: NcOrigin): string {
  return NC_ORIGIN_OPTIONS.find((o) => o.value === origin)?.label ?? origin;
}

export function getSeverityLabel(severity: NcSeverity): string {
  return SEVERITY_OPTIONS.find((s) => s.value === severity)?.label ?? severity;
}

export function getStatusBadgeVariant(
  status: NcStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "closed") return "success";
  if (status === "overdue") return "danger";
  if (status === "in_progress" || status === "pending_verification")
    return "warning";
  return "neutral";
}

export function getSeverityBadgeVariant(
  severity: NcSeverity
): "success" | "warning" | "danger" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "major") return "warning";
  if (severity === "minor") return "neutral";
  return "neutral";
}
