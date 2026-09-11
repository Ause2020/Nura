import { redirect } from "next/navigation";
import { AuditsDashboard } from "@/components/auditorias/audits-dashboard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditTemplate, Profile } from "@/types/database";

interface PageProps {
  searchParams: Promise<{ nueva?: string; catalog?: string }>;
}

const AUDIT_LIST_FIELDS =
  "id, title, audit_type, standard, scheduled_date, completed_date, auditor_name, status, compliance_score, site_area";

export default async function AuditoriasPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const [{ data: auditsData }, { data: templatesData }, { data: membersData }] =
    await Promise.all([
      supabase
        .from("audits")
        .select(AUDIT_LIST_FIELDS)
        .eq("organization_id", orgId)
        .order("scheduled_date", { ascending: false }),
      supabase
        .from("audit_templates")
        .select("id, name, description, source_standard, is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("organization_id", orgId)
        .order("full_name"),
    ]);

  const audits = (auditsData ?? []) as Audit[];

  const upcoming = audits.filter(
    (a) => a.status === "scheduled" || a.status === "in_progress"
  );
  const completed = audits.filter((a) => a.status === "completed");

  return (
    <AuditsDashboard
      upcoming={upcoming}
      completed={completed}
      organizationId={orgId}
      userId={user.id}
      templates={(templatesData ?? []) as AuditTemplate[]}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
      initialOpen={query.nueva === "1"}
      initialCatalogKey={query.catalog ?? null}
    />
  );
}
