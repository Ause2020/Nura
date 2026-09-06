import { redirect } from "next/navigation";
import { AuditCalendar } from "@/components/auditorias/audit-calendar";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Audit } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function AuditCalendarPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: auditsData } = await supabase
    .from("audits")
    .select(
      "id, title, audit_type, standard, scheduled_date, completed_date, auditor_name, status, compliance_score, site_area"
    )
    .eq("organization_id", orgId)
    .order("scheduled_date", { ascending: true });

  return <AuditCalendar audits={(auditsData ?? []) as Audit[]} />;
}
