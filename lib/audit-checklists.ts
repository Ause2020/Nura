import {
  getCatalogChecklist,
  getCatalogForStandard,
  groupCatalogItems,
  type AuditCatalogItem,
} from "@/lib/audit/catalog";
import type { AuditStandard } from "@/types/database";

export type AuditChecklistTemplateItem = AuditCatalogItem;

export const AUDIT_CHECKLISTS: Partial<
  Record<AuditStandard, AuditChecklistTemplateItem[]>
> = {
  haccp_codex: getCatalogChecklist("haccp_codex"),
  iso22000: getCatalogChecklist("iso22000"),
  fda_fsma: getCatalogChecklist("fda_fsma"),
  fssc22000: getCatalogChecklist("fssc22000"),
  brc: getCatalogChecklist("brc"),
};

export function getChecklistForStandard(
  standard: AuditStandard
): AuditChecklistTemplateItem[] {
  return getCatalogForStandard(standard);
}

export function groupChecklistBySection(
  items: AuditChecklistTemplateItem[]
): Map<string, AuditChecklistTemplateItem[]> {
  return groupCatalogItems(items);
}
