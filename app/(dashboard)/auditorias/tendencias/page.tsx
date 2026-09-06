import { redirect } from "next/navigation";
import { AuditTrendsPanel } from "@/components/auditorias/audit-trends-panel";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditTemplate } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function AuditTrendsPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: auditsData }, { data: templatesData }] = await Promise.all([
    supabase
      .from("audits")
      .select(
        "id, title, audit_type, standard, scheduled_date, completed_date, auditor_name, status, compliance_score, site_area, template_id"
      )
      .eq("organization_id", orgId)
      .order("completed_date", { ascending: false }),
    supabase
      .from("audit_templates")
      .select("id, name")
      .eq("organization_id", orgId),
  ]);

  return (
    <AuditTrendsPanel
      audits={(auditsData ?? []) as Audit[]}
      templates={(templatesData ?? []) as Pick<AuditTemplate, "id" | "name">[]}
    />
  );
}
