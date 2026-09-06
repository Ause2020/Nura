import type {
  SupplierApprovalChecklistItem,
  SupplierCriticality,
  SupplierDocType,
} from "@/types/database";

export const DEFAULT_CHECKLIST_BY_CRITICALITY: Record<
  SupplierCriticality,
  Omit<SupplierApprovalChecklistItem, "id" | "organization_id">[]
> = {
  critical: [
    {
      criticality: "critical",
      item_key: "legal_docs",
      label: "Documentación legal y fiscal verificada",
      doc_type: null,
      required: true,
      sort_order: 1,
    },
    {
      criticality: "critical",
      item_key: "sanitary_cert",
      label: "Certificado sanitario vigente",
      doc_type: "sanitary_certificate",
      required: true,
      sort_order: 2,
    },
    {
      criticality: "critical",
      item_key: "haccp_cert",
      label: "Certificado HACCP o equivalente",
      doc_type: "haccp_cert",
      required: true,
      sort_order: 3,
    },
    {
      criticality: "critical",
      item_key: "analysis_report",
      label: "Informe de análisis reciente",
      doc_type: "analysis_report",
      required: true,
      sort_order: 4,
    },
    {
      criticality: "critical",
      item_key: "site_audit",
      label: "Auditoría o visita de campo documentada",
      doc_type: null,
      required: true,
      sort_order: 5,
    },
  ],
  major: [
    {
      criticality: "major",
      item_key: "legal_docs",
      label: "Documentación legal verificada",
      doc_type: null,
      required: true,
      sort_order: 1,
    },
    {
      criticality: "major",
      item_key: "sanitary_cert",
      label: "Certificado sanitario vigente",
      doc_type: "sanitary_certificate",
      required: true,
      sort_order: 2,
    },
    {
      criticality: "major",
      item_key: "technical_sheet",
      label: "Ficha técnica del producto/servicio",
      doc_type: "technical_sheet",
      required: true,
      sort_order: 3,
    },
  ],
  minor: [
    {
      criticality: "minor",
      item_key: "legal_docs",
      label: "Documentación básica verificada",
      doc_type: null,
      required: true,
      sort_order: 1,
    },
    {
      criticality: "minor",
      item_key: "technical_sheet",
      label: "Ficha técnica o cotización",
      doc_type: "technical_sheet",
      required: true,
      sort_order: 2,
    },
  ],
};

export function getRequiredDocTypes(
  criticality: SupplierCriticality
): SupplierDocType[] {
  return DEFAULT_CHECKLIST_BY_CRITICALITY[criticality]
    .filter((item) => item.doc_type)
    .map((item) => item.doc_type as SupplierDocType);
}

export function mergeChecklistWithDefaults(
  organizationId: string,
  criticality: SupplierCriticality,
  dbItems: SupplierApprovalChecklistItem[]
): SupplierApprovalChecklistItem[] {
  if (dbItems.length > 0) {
    return [...dbItems].sort((a, b) => a.sort_order - b.sort_order);
  }

  return DEFAULT_CHECKLIST_BY_CRITICALITY[criticality].map((item, idx) => ({
    ...item,
    id: `default-${criticality}-${idx}`,
    organization_id: organizationId,
  }));
}
