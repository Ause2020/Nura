import { createAdminClient } from "@/lib/supabase/admin";

const ORG_TABLES = [
  "haccp_products",
  "haccp_process_steps",
  "haccp_hazards",
  "haccp_ccps",
  "haccp_plan_versions",
  "haccp_plan_version_log",
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
  "suppliers",
  "supplier_documents",
  "supplier_evaluations",
  "supplier_incidents",
  "supplier_approval_checklist",
  "supplier_approval_responses",
  "supplier_approval_log",
  "supplier_portal_tokens",
  "training_courses",
  "training_quiz_questions",
  "training_role_requirements",
  "training_assignments",
  "training_completions",
  "customer_complaints",
  "complaint_photos",
  "complaint_status_log",
  "controlled_documents",
  "document_versions",
  "document_state_log",
  "document_read_acknowledgments",
  "production_form_templates",
  "production_form_sections",
  "production_form_fields",
  "production_form_submissions",
  "production_form_submission_values",
  "trace_lots",
  "trace_lot_compositions",
  "trace_events",
  "mock_recall_simulations",
  "mock_recall_simulation_lots",
  "capa_stage_log",
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

  return {
    exported_at: new Date().toISOString(),
    organization: orgData,
    profiles: profilesData ?? [],
    notification_preferences: prefsData,
    data: tables,
  };
}
