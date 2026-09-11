import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuditTemplateBuilder } from "@/components/auditorias/audit-template-builder";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  AuditTemplate,
  AuditTemplateItem,
  AuditTemplateSection,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";
import { canManageQuality } from "@/lib/auth/permissions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarPlantillaAuditoriaPage({ params }: PageProps) {
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
  if (!canManageQuality(role)) {
    redirect("/auditorias/plantillas");
  }

  const { data: templateData } = await supabase
    .from("audit_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const template = templateData as AuditTemplate | null;
  if (!template) notFound();

  const { data: sectionsData } = await supabase
    .from("audit_template_sections")
    .select("*")
    .eq("template_id", template.id)
    .order("position");

  const sections = (sectionsData ?? []) as AuditTemplateSection[];
  const sectionIds = sections.map((s) => s.id);

  let items: AuditTemplateItem[] = [];
  if (sectionIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("audit_template_items")
      .select("*")
      .in("section_id", sectionIds)
      .order("position");
    items = (itemsData ?? []) as AuditTemplateItem[];
  }

  return (
    <>
      <ModuleHeader
        title={template.name}
        description="Editar plantilla de auditoría"
        actions={
          <Link href="/auditorias/plantillas">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />
      <div className="px-6 py-4 max-w-3xl">
        <AuditTemplateBuilder
          organizationId={orgId}
          userId={user.id}
          template={template}
          initialSections={sections}
          initialItems={items}
        />
      </div>
    </>
  );
}
