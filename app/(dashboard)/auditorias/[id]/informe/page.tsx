import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuditReport } from "@/components/auditorias/audit-report";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { resolveOrgLogoPublicUrl } from "@/lib/storage/org-logo";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditChecklistItem, AuditFinding } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InformeAuditoriaPage({ params }: PageProps) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: auditData } = await supabase
    .from("audits")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const audit = auditData as Audit | null;
  if (!audit) notFound();

  if (audit.status !== "completed") {
    redirect(`/auditorias/${id}/ejecutar`);
  }

  const [{ data: itemsData }, { data: findingsData }, { data: orgData }] =
    await Promise.all([
    supabase
      .from("audit_checklist_items")
      .select("*")
      .eq("audit_id", audit.id)
      .order("position", { ascending: true }),
    supabase
      .from("audit_findings")
      .select("*")
      .eq("audit_id", audit.id)
      .order("created_at", { ascending: true }),
    supabase.from("organizations").select("logo_url").eq("id", orgId).single(),
  ]);

  const items = (itemsData ?? []) as AuditChecklistItem[];
  const findings = (findingsData ?? []) as AuditFinding[];
  const org = orgData as { logo_url: string | null } | null;

  return (
    <>
      <ModuleHeader
        title="Informe de auditoría"
        description={audit.title}
        actions={
          <Link href="/auditorias">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />
      <div className="px-4 md:px-6 py-4 max-w-4xl mx-auto">
        <AuditReport
          audit={audit}
          items={items}
          findings={findings}
          organizationId={orgId}
          userId={user.id}
          organizationLogoUrl={resolveOrgLogoPublicUrl(org?.logo_url, orgId)}
        />
      </div>
    </>
  );
}
