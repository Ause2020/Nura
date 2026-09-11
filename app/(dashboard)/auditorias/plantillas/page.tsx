import { redirect } from "next/navigation";
import { AuditTemplatesDashboard } from "@/components/auditorias/audit-templates-dashboard";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { AuditTemplate, UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";
import { canManageQuality } from "@/lib/auth/permissions";

export default async function AuditTemplatesPage() {
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
  const canManage = canManageQuality(role);

  const { data: templatesData } = await supabase
    .from("audit_templates")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  const templates = (templatesData ?? []) as AuditTemplate[];
  const templateIds = templates.map((t) => t.id);

  const itemCounts: Record<string, number> = {};
  if (templateIds.length > 0) {
    const { data: sectionsData } = await supabase
      .from("audit_template_sections")
      .select("id, template_id")
      .in("template_id", templateIds);

    const sectionToTemplate = new Map<string, string>();
    for (const row of sectionsData ?? []) {
      const s = row as { id: string; template_id: string };
      sectionToTemplate.set(s.id, s.template_id);
    }

    const sectionIds = Array.from(sectionToTemplate.keys());
    if (sectionIds.length > 0) {
      const { data: itemsData } = await supabase
        .from("audit_template_items")
        .select("section_id")
        .in("section_id", sectionIds);

      for (const row of itemsData ?? []) {
        const sectionId = (row as { section_id: string }).section_id;
        const templateId = sectionToTemplate.get(sectionId);
        if (templateId) {
          itemCounts[templateId] = (itemCounts[templateId] ?? 0) + 1;
        }
      }
    }
  }

  return (
    <AuditTemplatesDashboard
      templates={templates}
      itemCounts={itemCounts}
      canManage={canManage}
      organizationId={orgId}
      userId={user.id}
    />
  );
}
