import type { HaccpProductStatus, ProcessStepType } from "@/types/database";
import type { LucideIcon } from "lucide-react";
import {
  Circle,
  Flame,
  Package,
  Send,
  Settings,
  Snowflake,
  Truck,
  Warehouse,
} from "lucide-react";

export const PRODUCT_CATEGORIES = [
  { value: "carnico", label: "Cárnico" },
  { value: "lacteo", label: "Lácteo" },
  { value: "panaderia", label: "Panadería" },
  { value: "conservas", label: "Conservas" },
  { value: "foodservice", label: "Food service" },
  { value: "otro", label: "Otro" },
] as const;

export const PACKAGING_TYPES = [
  { value: "bolsa", label: "Bolsa" },
  { value: "bandeja", label: "Bandeja" },
  { value: "lata", label: "Lata" },
  { value: "vidrio", label: "Vidrio" },
  { value: "otro", label: "Otro" },
] as const;

export interface StepTypeOption {
  value: ProcessStepType;
  label: string;
  icon: LucideIcon;
}

export const STEP_TYPES: StepTypeOption[] = [
  { value: "reception", label: "Recepción", icon: Truck },
  { value: "storage", label: "Almacenamiento", icon: Warehouse },
  { value: "processing", label: "Procesado", icon: Settings },
  { value: "cooking", label: "Cocción", icon: Flame },
  { value: "cooling", label: "Enfriamiento", icon: Snowflake },
  { value: "packaging", label: "Empaque", icon: Package },
  { value: "dispatch", label: "Despacho", icon: Send },
  { value: "other", label: "Otro", icon: Circle },
];

export const STATUS_LABELS: Record<HaccpProductStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

export function getCategoryLabel(value: string): string {
  return PRODUCT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function getPackagingLabel(value: string): string {
  return PACKAGING_TYPES.find((p) => p.value === value)?.label ?? value;
}

export function getStepTypeConfig(type: ProcessStepType): StepTypeOption {
  return STEP_TYPES.find((s) => s.value === type) ?? STEP_TYPES[STEP_TYPES.length - 1];
}

export function getStatusBadgeVariant(
  status: HaccpProductStatus
): "success" | "warning" | "neutral" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export function getCompletionBarColor(percent: number): string {
  if (percent < 40) return "bg-danger";
  if (percent <= 80) return "bg-amber";
  return "bg-sage";
}

export function calculatePlanCompletion(stepCount: number, hasDetails: boolean): number {
  if (stepCount === 0) return 0;
  const base = Math.min(stepCount * 15, 60);
  return hasDetails ? Math.min(base + 20, 100) : base;
}

export const HACCP_TABS = [
  { id: "ficha", label: "Ficha técnica" },
  { id: "diagrama", label: "Diagrama de proceso" },
  { id: "peligros", label: "Análisis de peligros" },
  { id: "ccps", label: "CCPs" },
  { id: "resumen", label: "Resumen del plan" },
  { id: "versiones", label: "Versiones" },
] as const;

export type HaccpTabId = (typeof HACCP_TABS)[number]["id"];
