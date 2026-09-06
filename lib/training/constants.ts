import type {
  TrainingAssignmentStatus,
  TrainingCompetencyStatus,
  TrainingCourseCategory,
  UserRole,
} from "@/types/database";

export const TRAINING_CATEGORIES: {
  value: TrainingCourseCategory;
  label: string;
}[] = [
  { value: "haccp", label: "HACCP" },
  { value: "gmp", label: "BPM / GMP" },
  { value: "hygiene", label: "Higiene personal" },
  { value: "allergens", label: "Alérgenos" },
  { value: "safety", label: "Seguridad" },
  { value: "other", label: "Otro" },
];

export const ASSIGNMENT_STATUSES: {
  value: TrainingAssignmentStatus;
  label: string;
}[] = [
  { value: "assigned", label: "Asignada" },
  { value: "in_progress", label: "En progreso" },
  { value: "completed", label: "Completada" },
  { value: "overdue", label: "Vencida" },
];

export const COMPETENCY_STATUS_LABELS: Record<TrainingCompetencyStatus, string> =
  {
    current: "Al día",
    expiring: "Próximo a vencer",
    expired: "Vencido",
    pending: "Pendiente",
    not_assigned: "No asignado",
  };

export const ROLE_OPTIONS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "Todo el personal" },
  { value: "operator", label: "Operadores" },
  { value: "quality_manager", label: "Jefe de calidad" },
  { value: "admin", label: "Administradores" },
];

export function getCategoryLabel(category: TrainingCourseCategory): string {
  return TRAINING_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function getAssignmentStatusLabel(
  status: TrainingAssignmentStatus
): string {
  return ASSIGNMENT_STATUSES.find((s) => s.value === status)?.label ?? status;
}
