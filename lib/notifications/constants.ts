export type NotificationType =
  | "capa_due"
  | "capa_overdue"
  | "prp_missed"
  | "audit_upcoming"
  | "nc_new"
  | "supplier_doc_expiring"
  | "supplier_eval_overdue"
  | "complaint_critical"
  | "document_read_required"
  | "training_due"
  | "training_overdue"
  | "complaint_sla_due"
  | "complaint_sla_overdue"
  | "daily_insight"
  | "system";

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  capa_due: "CAPA por vencer",
  capa_overdue: "CAPA vencida",
  prp_missed: "PRP pendiente",
  audit_upcoming: "Auditoría próxima",
  nc_new: "Nueva NC",
  supplier_doc_expiring: "Doc. proveedor por vencer",
  supplier_eval_overdue: "Evaluación proveedor vencida",
  complaint_critical: "Reclamo crítico",
  document_read_required: "Acuse de lectura",
  training_due: "Capacitación por vencer",
  training_overdue: "Capacitación vencida",
  complaint_sla_due: "Reclamo SLA por vencer",
  complaint_sla_overdue: "Reclamo SLA vencido",
  daily_insight: "Análisis diario",
  system: "Sistema",
};
