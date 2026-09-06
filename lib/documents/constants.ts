import type {
  DocumentCategory,
  DocumentStatus,
  UserRole,
} from "@/types/database";

export const DOCUMENT_CATEGORIES: {
  value: DocumentCategory;
  label: string;
}[] = [
  { value: "procedure", label: "Procedimiento" },
  { value: "instruction", label: "Instrucción de trabajo" },
  { value: "form", label: "Formato / Formulario" },
  { value: "policy", label: "Política" },
  { value: "specification", label: "Especificación" },
  { value: "record", label: "Registro" },
  { value: "other", label: "Otro" },
];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  published: "Publicado",
  obsolete: "Obsoleto",
};

export const DOCUMENT_STATUS_VARIANT: Record<
  DocumentStatus,
  "neutral" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  published: "success",
  obsolete: "danger",
};

export const READ_TARGET_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administradores" },
  { value: "quality_manager", label: "Jefe de calidad" },
  { value: "operator", label: "Operadores" },
];

export function getCategoryLabel(category: DocumentCategory): string {
  return (
    DOCUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category
  );
}

export function getStatusLabel(status: DocumentStatus): string {
  return DOCUMENT_STATUS_LABELS[status] ?? status;
}
