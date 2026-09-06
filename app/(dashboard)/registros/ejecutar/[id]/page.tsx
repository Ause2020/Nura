import { notFound, redirect } from "next/navigation";
import { ProductionFormExecutor } from "@/components/production-records/production-form-executor";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function EjecutarRegistroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: templateData } = await supabase
    .from("production_form_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (!templateData) notFound();

  const [{ data: sectionsData }, { data: fieldsData }] = await Promise.all([
    supabase
      .from("production_form_sections")
      .select("*")
      .eq("template_id", id)
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("production_form_fields")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order"),
  ]);

  const sectionIds = new Set(
    (sectionsData ?? []).map((s) => (s as ProductionFormSection).id)
  );
  const fields = (fieldsData ?? []).filter((f) =>
    sectionIds.has((f as ProductionFormField).section_id)
  ) as ProductionFormField[];

  if ((sectionsData ?? []).length === 0 || fields.length === 0) {
    notFound();
  }

  return (
    <ProductionFormExecutor
      template={templateData as ProductionFormTemplate}
      sections={(sectionsData ?? []) as ProductionFormSection[]}
      fields={fields}
      organizationId={orgId}
      userId={user.id}
    />
  );
}
