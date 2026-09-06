import {
  getCatalogChecklist,
  getCatalogTemplate,
  groupCatalogItems,
} from "@/lib/audit/catalog";
import { getChecklistForStandard } from "@/lib/audit-checklists";
import type { AuditStandard } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export interface TemplateBuilderSection {
  id: string;
  name: string;
  position: number;
  items: {
    id: string;
    requirement: string;
    reference: string;
    position: number;
  }[];
}

function sectionsFromItems(
  checklist: { section: string; requirement: string; reference: string }[]
): TemplateBuilderSection[] {
  const groups = groupCatalogItems(checklist);

  return Array.from(groups.entries()).map(([name, items], sectionIndex) => ({
    id: crypto.randomUUID(),
    name,
    position: sectionIndex,
    items: items.map((item, itemIndex) => ({
      id: crypto.randomUUID(),
      requirement: item.requirement,
      reference: item.reference,
      position: itemIndex,
    })),
  }));
}

export function sectionsFromStandard(
  standard: AuditStandard
): TemplateBuilderSection[] {
  return sectionsFromItems(getChecklistForStandard(standard));
}

export function sectionsFromCatalog(catalogKey: string): TemplateBuilderSection[] {
  const items = getCatalogChecklist(catalogKey);
  if (items.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        name: "",
        position: 0,
        items: [
          {
            id: crypto.randomUUID(),
            requirement: "",
            reference: "",
            position: 0,
          },
        ],
      },
    ];
  }
  return sectionsFromItems(items);
}

export async function instantiateAuditChecklist(
  supabase: SupabaseClient,
  input: {
    auditId: string;
    organizationId: string;
    templateId: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { data: sectionsData, error: sectionsError } = await supabase
    .from("audit_template_sections")
    .select("id, name, position")
    .eq("template_id", input.templateId)
    .order("position", { ascending: true });

  if (sectionsError) {
    return { ok: false, error: sectionsError.message };
  }

  const sections = sectionsData ?? [];
  if (sections.length === 0) {
    return { ok: false, error: "La plantilla no tiene secciones" };
  }

  let position = 1;
  const rows: {
    audit_id: string;
    organization_id: string;
    section: string;
    requirement: string;
    reference: string | null;
    position: number;
    result: "not_evaluated";
  }[] = [];

  for (const section of sections) {
    const s = section as { id: string; name: string };
    const { data: itemsData } = await supabase
      .from("audit_template_items")
      .select("requirement, reference, position")
      .eq("section_id", s.id)
      .order("position", { ascending: true });

    for (const item of itemsData ?? []) {
      const row = item as {
        requirement: string;
        reference: string | null;
      };
      rows.push({
        audit_id: input.auditId,
        organization_id: input.organizationId,
        section: s.name,
        requirement: row.requirement,
        reference: row.reference,
        position: position++,
        result: "not_evaluated",
      });
    }
  }

  if (rows.length === 0) {
    return { ok: false, error: "La plantilla no tiene requisitos" };
  }

  const { error } = await supabase.from("audit_checklist_items").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cloneCatalogTemplate(
  supabase: SupabaseClient,
  input: {
    catalogKey: string;
    organizationId: string;
    userId: string;
  }
): Promise<string | null> {
  const catalog = getCatalogTemplate(input.catalogKey);
  if (!catalog) return null;

  const { data: newTemplate, error } = await supabase
    .from("audit_templates")
    .insert({
      organization_id: input.organizationId,
      name: catalog.name,
      description: catalog.description,
      source_standard:
        catalog.standard === "custom" ? input.catalogKey : catalog.standard,
      created_by: input.userId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !newTemplate) return null;

  const newTemplateId = (newTemplate as { id: string }).id;
  const groups = groupCatalogItems(catalog.items);
  let sectionPosition = 0;

  for (const [name, items] of Array.from(groups.entries())) {
    const { data: newSection } = await supabase
      .from("audit_template_sections")
      .insert({
        organization_id: input.organizationId,
        template_id: newTemplateId,
        name,
        position: sectionPosition++,
      })
      .select("id")
      .single();

    if (!newSection) continue;

    await supabase.from("audit_template_items").insert(
      items.map((item, index) => ({
        organization_id: input.organizationId,
        section_id: (newSection as { id: string }).id,
        requirement: item.requirement,
        reference: item.reference || null,
        position: index,
      }))
    );
  }

  return newTemplateId;
}

export async function duplicateAuditTemplate(
  supabase: SupabaseClient,
  input: {
    templateId: string;
    organizationId: string;
    userId: string;
    newName?: string;
  }
): Promise<string | null> {
  const { data: templateData } = await supabase
    .from("audit_templates")
    .select("*")
    .eq("id", input.templateId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const template = templateData as {
    name: string;
    description: string | null;
    source_standard: string | null;
  } | null;

  if (!template) return null;

  const { data: newTemplate, error } = await supabase
    .from("audit_templates")
    .insert({
      organization_id: input.organizationId,
      name: input.newName ?? `${template.name} (copia)`,
      description: template.description,
      source_standard: template.source_standard,
      created_by: input.userId,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !newTemplate) return null;

  const newTemplateId = (newTemplate as { id: string }).id;

  const { data: sections } = await supabase
    .from("audit_template_sections")
    .select("*")
    .eq("template_id", input.templateId)
    .order("position");

  for (const section of sections ?? []) {
    const s = section as {
      id: string;
      name: string;
      position: number;
    };

    const { data: newSection } = await supabase
      .from("audit_template_sections")
      .insert({
        organization_id: input.organizationId,
        template_id: newTemplateId,
        name: s.name,
        position: s.position,
      })
      .select("id")
      .single();

    if (!newSection) continue;

    const { data: items } = await supabase
      .from("audit_template_items")
      .select("*")
      .eq("section_id", s.id)
      .order("position");

    if (items?.length) {
      await supabase.from("audit_template_items").insert(
        items.map((item) => {
          const row = item as {
            requirement: string;
            reference: string | null;
            position: number;
          };
          return {
            organization_id: input.organizationId,
            section_id: (newSection as { id: string }).id,
            requirement: row.requirement,
            reference: row.reference,
            position: row.position,
          };
        })
      );
    }
  }

  return newTemplateId;
}

export function hasAuditorAreaConflict(input: {
  assignedTo: string | null;
  siteResponsibleId: string | null;
}): boolean {
  return Boolean(
    input.assignedTo &&
      input.siteResponsibleId &&
      input.assignedTo === input.siteResponsibleId
  );
}
