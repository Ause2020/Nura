import { redirect } from "next/navigation";
import { DigitalizarView } from "@/components/production-records/digitalizar-view";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

export default async function DigitalizarPage() {
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: templatesData }, { data: sectionsData }, { data: fieldsData }] =
    await Promise.all([
      supabase
        .from("production_form_templates")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("production_form_sections")
        .select("*")
        .eq("organization_id", orgId)
        .order("sort_order"),
      supabase
        .from("production_form_fields")
        .select("*")
        .eq("organization_id", orgId)
        .order("sort_order"),
    ]);

  const templates = (templatesData ?? []) as ProductionFormTemplate[];
  const sections = (sectionsData ?? []) as ProductionFormSection[];
  const fields = (fieldsData ?? []) as ProductionFormField[];

  const bundles = templates.map((template) => {
    const templateSections = sections.filter((s) => s.template_id === template.id);
    const sectionIds = new Set(templateSections.map((s) => s.id));
    return {
      template,
      sections: templateSections,
      fields: fields.filter((f) => sectionIds.has(f.section_id)),
    };
  }).filter((b) => b.sections.length > 0 && b.fields.length > 0);

  return (
    <>
      <ModuleHeader
        title="Digitalizar"
        description="Pasa una planilla manuscrita al histórico, con revisión humana"
      />
      <MonitoreoNav />
      <DigitalizarView
        bundles={bundles}
        organizationId={orgId}
        userId={user.id}
        aiReady={isAiConfigured()}
      />
    </>
  );
}
