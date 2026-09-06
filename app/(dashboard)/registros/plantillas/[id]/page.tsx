import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ProductionFormBuilder } from "@/components/production-records/production-form-builder";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function EditarPlantillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profileData as { role: UserRole } | null)?.role ?? "operator";
  if (role !== "admin" && role !== "quality_manager") {
    redirect("/registros/plantillas");
  }

  const { data: templateData } = await supabase
    .from("production_form_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
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

  return (
    <div>
      <ModuleHeader
        title="Editar plantilla"
        description={(templateData as ProductionFormTemplate).name}
        actions={
          <Link href={`/registros/generar`}>
            <Button type="button" variant="secondary">
              <Play className="h-4 w-4" />
              Generar QR
            </Button>
          </Link>
        }
      />
      <MonitoreoNav />
      <ProductionFormBuilder
        organizationId={orgId}
        userId={user.id}
        template={templateData as ProductionFormTemplate}
        initialSections={(sectionsData ?? []) as ProductionFormSection[]}
        initialFields={fields}
      />
    </div>
  );
}
