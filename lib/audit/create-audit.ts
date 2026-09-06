import {
  getCatalogChecklist,
  getCatalogTemplate,
  type AuditCatalogItem,
} from "@/lib/audit/catalog";
import { getChecklistForStandard } from "@/lib/audit-checklists";
import { instantiateAuditChecklist } from "@/lib/audit/templates";
import type { AuditStandard, AuditType } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export type CreateAuditInput = {
  organizationId: string;
  userId: string;
  title: string;
  auditType: AuditType;
  standard: AuditStandard;
  scheduledDate: string;
  auditorName: string | null;
  scope: string | null;
  siteArea: string | null;
  assignedTo: string | null;
  siteResponsibleId: string | null;
  orgTemplateId: string | null;
  catalogKey: string | null;
};

export type CreateAuditResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const OPTIONAL_AUDIT_COLUMNS = [
  "template_id",
  "assigned_to",
  "site_area",
  "site_responsible_id",
] as const;

function humanizeCreateError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("column") && lower.includes("does not exist")) {
    return "Falta aplicar la migración de auditorías en Supabase (023_audit_templates).";
  }
  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("42501")
  ) {
    return "No tienes permiso para crear auditorías en esta organización.";
  }
  if (lower.includes("foreign key") || lower.includes("violates foreign key")) {
    return "Hay un dato inválido (usuario, plantilla u organización). Recarga e inténtalo de nuevo.";
  }
  if (lower.includes("not null")) {
    return "Faltan datos obligatorios para crear la auditoría.";
  }
  return message || "No pudimos crear la auditoría";
}

function checklistFromCatalog(
  catalogKey: string | null,
  standard: AuditStandard
): AuditCatalogItem[] {
  if (catalogKey) {
    const fromKey = getCatalogChecklist(catalogKey);
    if (fromKey.length > 0) return fromKey;
  }
  return getChecklistForStandard(standard);
}

async function insertChecklistRows(
  supabase: SupabaseClient,
  auditId: string,
  organizationId: string,
  items: AuditCatalogItem[]
): Promise<{ ok: boolean; error?: string }> {
  if (items.length === 0) {
    return { ok: false, error: "La plantilla no tiene ítems de checklist" };
  }

  const rows = items.map((item, index) => ({
    audit_id: auditId,
    organization_id: organizationId,
    section: item.section,
    requirement: item.requirement,
    reference: item.reference || null,
    position: index + 1,
    result: "not_evaluated" as const,
  }));

  const first = await supabase.from("audit_checklist_items").insert(rows);
  if (!first.error) return { ok: true };

  const fallbackRows = rows.map(({ result: _result, ...row }) => row);
  const retry = await supabase.from("audit_checklist_items").insert(fallbackRows);
  if (!retry.error) return { ok: true };

  return {
    ok: false,
    error: humanizeCreateError(first.error.message || retry.error.message),
  };
}

async function insertAuditRow(
  supabase: SupabaseClient,
  input: CreateAuditInput
): Promise<{ id: string } | { error: string }> {
  const catalog = input.catalogKey ? getCatalogTemplate(input.catalogKey) : undefined;
  const standard = catalog?.standard ?? input.standard;

  const fullPayload = {
    organization_id: input.organizationId,
    title: input.title.trim(),
    audit_type: input.auditType,
    standard,
    scheduled_date: input.scheduledDate,
    auditor_name: input.auditorName,
    scope: input.scope,
    site_area: input.siteArea,
    assigned_to: input.assignedTo,
    site_responsible_id: input.siteResponsibleId,
    template_id: input.orgTemplateId,
    created_by: input.userId,
    status: "scheduled",
  };

  const first = await supabase.from("audits").insert(fullPayload).select("id").single();
  if (!first.error && first.data) {
    return { id: (first.data as { id: string }).id };
  }

  const message = first.error?.message ?? "";
  const missingOptional = OPTIONAL_AUDIT_COLUMNS.some((col) =>
    message.toLowerCase().includes(col)
  );

  if (missingOptional || message.toLowerCase().includes("does not exist")) {
    const corePayload = {
      organization_id: input.organizationId,
      title: input.title.trim(),
      audit_type: input.auditType,
      standard,
      scheduled_date: input.scheduledDate,
      auditor_name: input.auditorName,
      scope: input.scope,
      created_by: input.userId,
      status: "scheduled",
    };
    const retry = await supabase.from("audits").insert(corePayload).select("id").single();
    if (!retry.error && retry.data) {
      return { id: (retry.data as { id: string }).id };
    }
    return { error: humanizeCreateError(retry.error?.message ?? message) };
  }

  return { error: humanizeCreateError(message) };
}

export async function createAudit(
  supabase: SupabaseClient,
  input: CreateAuditInput
): Promise<CreateAuditResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "El título es requerido" };
  }
  if (!input.organizationId) {
    return { ok: false, error: "No hay organización activa" };
  }
  if (!input.scheduledDate) {
    return { ok: false, error: "La fecha programada es requerida" };
  }

  const inserted = await insertAuditRow(supabase, input);
  if ("error" in inserted) {
    return { ok: false, error: inserted.error };
  }

  const auditId = inserted.id;
  let checklistOk = false;
  let checklistError = "";

  if (input.orgTemplateId) {
    const fromDb = await instantiateAuditChecklist(supabase, {
      auditId,
      organizationId: input.organizationId,
      templateId: input.orgTemplateId,
    });
    checklistOk = fromDb.ok;
    if (!fromDb.ok) checklistError = fromDb.error ?? "";
  }

  if (!checklistOk) {
    const items = checklistFromCatalog(input.catalogKey, input.standard);
    const fromCatalog = await insertChecklistRows(
      supabase,
      auditId,
      input.organizationId,
      items
    );
    checklistOk = fromCatalog.ok;
    if (!fromCatalog.ok) {
      checklistError = fromCatalog.error ?? checklistError;
    }
  }

  if (!checklistOk && checklistError) {
    console.warn("[createAudit] checklist:", checklistError);
  }

  return { ok: true, id: auditId };
}

export async function ensureAuditChecklist(
  supabase: SupabaseClient,
  input: {
    auditId: string;
    organizationId: string;
    standard: AuditStandard;
    templateId?: string | null;
  }
): Promise<boolean> {
  const { count } = await supabase
    .from("audit_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("audit_id", input.auditId);

  if ((count ?? 0) > 0) return true;

  if (input.templateId) {
    const fromDb = await instantiateAuditChecklist(supabase, {
      auditId: input.auditId,
      organizationId: input.organizationId,
      templateId: input.templateId,
    });
    if (fromDb.ok) return true;
  }

  const items = getChecklistForStandard(input.standard);
  const inserted = await insertChecklistRows(
    supabase,
    input.auditId,
    input.organizationId,
    items
  );
  return inserted.ok;
}
