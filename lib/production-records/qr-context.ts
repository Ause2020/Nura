import { createAdminClient } from "@/lib/supabase/admin";
import { isQrLinkActive } from "@/lib/production-records/qr";
import type {
  MonitoringQrLink,
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

export interface FieldMonitorContext {
  link: MonitoringQrLink;
  template: ProductionFormTemplate;
  sections: ProductionFormSection[];
  fields: ProductionFormField[];
  organizationName: string;
}

export async function getFieldMonitorContext(
  token: string
): Promise<FieldMonitorContext | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("monitoring_qr_links")
    .select("*")
    .eq("token", token.trim())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as MonitoringQrLink;
  if (!isQrLinkActive(row)) return null;

  const [{ data: templateData }, { data: orgData }] = await Promise.all([
    admin
      .from("production_form_templates")
      .select("*")
      .eq("id", row.template_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", row.organization_id)
      .maybeSingle(),
  ]);

  const template = templateData as ProductionFormTemplate | null;
  const org = orgData as { name: string } | null;

  if (!template || !template.is_active) return null;

  const [{ data: sectionsData }, { data: fieldsData }] = await Promise.all([
    admin
      .from("production_form_sections")
      .select("*")
      .eq("template_id", template.id)
      .order("sort_order"),
    admin
      .from("production_form_fields")
      .select("*")
      .eq("organization_id", row.organization_id)
      .order("sort_order"),
  ]);

  const sections = (sectionsData ?? []) as ProductionFormSection[];
  const sectionIds = new Set(sections.map((s) => s.id));
  const fields = ((fieldsData ?? []) as ProductionFormField[]).filter((f) =>
    sectionIds.has(f.section_id)
  );

  if (sections.length === 0 || fields.length === 0) return null;

  return {
    link: row,
    template,
    sections,
    fields,
    organizationName: org?.name ?? "Nura",
  };
}
