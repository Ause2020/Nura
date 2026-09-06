/**
 * Export labels dictionary — ES / EN.
 * Only headers and section titles for exported files.
 * User-entered data (descriptions, names, etc.) is exported as-is.
 */

export type ExportLang = "es" | "en";

export interface AuditExportLabels {
  // Document metadata
  reportTitle: string;
  auditReport: string;
  generatedOn: string;
  organization: string;
  // Audit fields
  auditTitle: string;
  auditType: string;
  standard: string;
  scheduledDate: string;
  completedDate: string;
  auditor: string;
  scope: string;
  complianceScore: string;
  // Summary section
  summaryTitle: string;
  complies: string;
  partial: string;
  notComplies: string;
  notApplicable: string;
  // Findings table
  findingsTitle: string;
  colNumber: string;
  colType: string;
  colSection: string;
  colRequirement: string;
  colDescription: string;
  colCapaStatus: string;
  colDate: string;
  // Finding types
  majorNc: string;
  minorNc: string;
  observation: string;
  opportunity: string;
  // CAPA status
  capaCreated: string;
  capaPending: string;
  notApplicableShort: string;
  // Checklist items table (for Excel sheet 2)
  checklistTitle: string;
  colResult: string;
  colFinding: string;
  resultComplies: string;
  resultPartial: string;
  resultNotComplies: string;
  resultNa: string;
  resultPending: string;
  // Signatures
  signaturesTitle: string;
  auditorSignature: string;
  orgRepresentative: string;
  // Audit types (for PDF header)
  auditTypeInternal: string;
  auditTypeExternal: string;
  auditTypeSupplier: string;
  auditTypeRegulatory: string;
  // Sheet names
  sheetFindings: string;
  sheetChecklist: string;
  // On-screen report
  sectionCompliance: string;
  noRadarData: string;
  back: string;
  sendToCapa: string;
  capaSent: string;
  capaFailed: string;
  ncCreatedCheck: string;
  dateLabel: string;
  companyLogo: string;
}

const ES: AuditExportLabels = {
  reportTitle: "Informe de Auditoría",
  auditReport: "INFORME DE AUDITORÍA",
  generatedOn: "Generado el",
  organization: "Organización",
  auditTitle: "Título",
  auditType: "Tipo de auditoría",
  standard: "Norma",
  scheduledDate: "Fecha programada",
  completedDate: "Fecha completada",
  auditor: "Auditor",
  scope: "Alcance",
  complianceScore: "% Cumplimiento",
  summaryTitle: "Resumen de resultados",
  complies: "Cumple",
  partial: "Parcial",
  notComplies: "No cumple",
  notApplicable: "No aplica",
  findingsTitle: "Hallazgos",
  colNumber: "N°",
  colType: "Tipo",
  colSection: "Sección",
  colRequirement: "Requisito",
  colDescription: "Descripción",
  colCapaStatus: "Estado CAPA",
  colDate: "Fecha",
  majorNc: "NC Mayor",
  minorNc: "NC Menor",
  observation: "Observación",
  opportunity: "Oportunidad de mejora",
  capaCreated: "NC creada",
  capaPending: "Pendiente",
  notApplicableShort: "—",
  checklistTitle: "Lista de verificación",
  colResult: "Resultado",
  colFinding: "Hallazgo",
  resultComplies: "Cumple",
  resultPartial: "Parcial",
  resultNotComplies: "No cumple",
  resultNa: "N/A",
  resultPending: "Sin evaluar",
  signaturesTitle: "Firmas",
  auditorSignature: "Auditor",
  orgRepresentative: "Representante de la organización",
  auditTypeInternal: "Interna",
  auditTypeExternal: "Externa",
  auditTypeSupplier: "Proveedor",
  auditTypeRegulatory: "Regulatoria",
  sheetFindings: "Hallazgos",
  sheetChecklist: "Verificación",
  sectionCompliance: "Cumplimiento por sección",
  noRadarData: "Sin datos para gráfica",
  back: "Volver",
  sendToCapa: "Enviar hallazgos a CAPA",
  capaSent: "hallazgo(s) enviados a CAPA",
  capaFailed: "No se pudieron crear las NC",
  ncCreatedCheck: "NC creada ✓",
  dateLabel: "Fecha",
  companyLogo: "Logo empresa",
};

const EN: AuditExportLabels = {
  reportTitle: "Audit Report",
  auditReport: "AUDIT REPORT",
  generatedOn: "Generated on",
  organization: "Organization",
  auditTitle: "Title",
  auditType: "Audit type",
  standard: "Standard",
  scheduledDate: "Scheduled date",
  completedDate: "Completed date",
  auditor: "Auditor",
  scope: "Scope",
  complianceScore: "Compliance score",
  summaryTitle: "Results summary",
  complies: "Compliant",
  partial: "Partial",
  notComplies: "Non-compliant",
  notApplicable: "Not applicable",
  findingsTitle: "Findings",
  colNumber: "#",
  colType: "Type",
  colSection: "Section",
  colRequirement: "Requirement",
  colDescription: "Description",
  colCapaStatus: "CAPA status",
  colDate: "Date",
  majorNc: "Major NC",
  minorNc: "Minor NC",
  observation: "Observation",
  opportunity: "Improvement opportunity",
  capaCreated: "NC created",
  capaPending: "Pending",
  notApplicableShort: "—",
  checklistTitle: "Verification checklist",
  colResult: "Result",
  colFinding: "Finding",
  resultComplies: "Compliant",
  resultPartial: "Partial",
  resultNotComplies: "Non-compliant",
  resultNa: "N/A",
  resultPending: "Not evaluated",
  signaturesTitle: "Signatures",
  auditorSignature: "Auditor",
  orgRepresentative: "Organization representative",
  auditTypeInternal: "Internal",
  auditTypeExternal: "External",
  auditTypeSupplier: "Supplier",
  auditTypeRegulatory: "Regulatory",
  sheetFindings: "Findings",
  sheetChecklist: "Checklist",
  sectionCompliance: "Compliance by section",
  noRadarData: "No data for chart",
  back: "Back",
  sendToCapa: "Send findings to CAPA",
  capaSent: "finding(s) sent to CAPA",
  capaFailed: "Could not create the NCs",
  ncCreatedCheck: "NC created ✓",
  dateLabel: "Date",
  companyLogo: "Company logo",
};

export const AUDIT_LABELS: Record<ExportLang, AuditExportLabels> = { es: ES, en: EN };

export function getAuditLabels(lang: ExportLang): AuditExportLabels {
  return AUDIT_LABELS[lang];
}

/** Map DB finding_type to localized label */
export function localFindingType(
  type: "major_nc" | "minor_nc" | "observation" | "opportunity",
  labels: AuditExportLabels
): string {
  const map: Record<string, string> = {
    major_nc: labels.majorNc,
    minor_nc: labels.minorNc,
    observation: labels.observation,
    opportunity: labels.opportunity,
  };
  return map[type] ?? type;
}

/** Map DB result to localized label */
export function localResult(
  result: string | null,
  labels: AuditExportLabels
): string {
  if (!result || result === "not_evaluated") return labels.resultPending;
  const map: Record<string, string> = {
    complies: labels.resultComplies,
    partial: labels.resultPartial,
    not_complies: labels.resultNotComplies,
    na: labels.resultNa,
  };
  return map[result] ?? result;
}

/** Map DB audit_type to localized label */
export function localAuditType(type: string, labels: AuditExportLabels): string {
  const map: Record<string, string> = {
    internal: labels.auditTypeInternal,
    external: labels.auditTypeExternal,
    supplier: labels.auditTypeSupplier,
    regulatory: labels.auditTypeRegulatory,
  };
  return map[type] ?? type;
}
