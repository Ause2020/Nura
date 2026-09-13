export type NotificationType =
  | "capa_due"
  | "capa_overdue"
  | "audit_upcoming"
  | "nc_new"
  | "document_read_required"
  | "daily_insight"
  | "system";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  capa_due: "CAPA por vencer",
  capa_overdue: "CAPA vencida",
  audit_upcoming: "Auditoría próxima",
  nc_new: "Nueva NC",
  document_read_required: "Acuse de lectura",
  daily_insight: "Análisis diario",
  system: "Sistema",
};
