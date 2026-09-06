import { redirect } from "next/navigation";
import { ProductionTemplatesDashboard } from "@/components/production-records/production-templates-dashboard";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProductionFormTemplate, UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function RegistrosPlantillasPage() {
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
  const canManage = role === "admin" || role === "quality_manager";

  const [{ data: templatesData }, { data: submissionsData }] = await Promise.all([
    supabase
      .from("production_form_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("production_form_submissions")
      .select("id, template_id")
      .eq("organization_id", orgId),
  ]);

  const submissionCounts: Record<string, number> = {};
  for (const row of submissionsData ?? []) {
    const tid = (row as { template_id: string }).template_id;
    submissionCounts[tid] = (submissionCounts[tid] ?? 0) + 1;
  }

  return (
    <ProductionTemplatesDashboard
      templates={(templatesData ?? []) as ProductionFormTemplate[]}
      submissionCounts={submissionCounts}
      canManage={canManage}
      organizationId={orgId}
      userId={user.id}
    />
  );
}
