import { createAdminClient } from "@/lib/supabase/admin";

const ORG_TABLES = [
  "haccp_plans",
  "haccp_step_data",
  "haccp_monitoring_records",
  "audits",
  "audit_checklist_items",
  "audit_findings",
  "audit_templates",
  "audit_template_sections",
  "audit_template_items",
  "nonconformities",
  "capa_actions",
  "nc_5whys",
  "nc_fishbone_causes",
  "notifications",
  "invitations",
  "controlled_documents",
  "document_versions",
  "document_state_log",
  "document_read_acknowledgments",
  "production_form_templates",
  "production_form_sections",
  "production_form_fields",
  "production_form_submissions",
  "production_form_submission_values",
  "capa_stage_log",
] as const;

const HACCP_PLAN_CHILD_TABLES = [
  "haccp_teams",
  "haccp_plan_products",
  "haccp_diagrams",
  "haccp_validations",
  "haccp_plan_hazards",
  "haccp_ccp_decisions",
] as const;

export async function exportOrganizationData(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");

  const { data: orgData } = await admin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();

  const { data: profilesData } = await admin
    .from("profiles")
    .select("id, full_name, role, job_title, created_at")
    .eq("organization_id", organizationId);

  const { data: prefsData } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const tables: Record<string, unknown[]> = {};

  for (const table of ORG_TABLES) {
    const { data } = await admin
      .from(table)
      .select("*")
      .eq("organization_id", organizationId);
    tables[table] = (data ?? []) as unknown[];
  }

  const planIds = (tables.haccp_plans as { id: string }[])
    .map((plan) => plan.id)
    .filter(Boolean);

  for (const table of HACCP_PLAN_CHILD_TABLES) {
    if (planIds.length === 0) {
      tables[table] = [];
      continue;
    }
    const { data } = await admin
      .from(table)
      .select("*")
      .in("plan_id", planIds);
    tables[table] = (data ?? []) as unknown[];
  }

  return {
    exported_at: new Date().toISOString(),
    organization: orgData,
    profiles: profilesData ?? [],
    notification_preferences: prefsData,
    data: tables,
  };
}
