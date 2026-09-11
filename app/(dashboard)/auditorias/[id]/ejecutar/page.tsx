import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExecuteAudit } from "@/components/auditorias/execute-audit";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ensureAuditChecklist } from "@/lib/audit/create-audit";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditChecklistItem } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EjecutarAuditoriaPage({ params }: PageProps) {
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

  if (audit.status === "completed") {
    redirect(`/auditorias/${id}/informe`);
  }

  if (audit.status === "cancelled") {
    redirect("/auditorias");
  }

  const { data: itemsData } = await supabase
    .from("audit_checklist_items")
    .select("*")
    .eq("audit_id", audit.id)
    .order("position", { ascending: true });

  let items = (itemsData ?? []) as AuditChecklistItem[];
  if (items.length === 0) {
    await ensureAuditChecklist(supabase, {
      auditId: audit.id,
      organizationId: orgId,
      standard: audit.standard,
      templateId: audit.template_id,
    });
    const refetch = await supabase
      .from("audit_checklist_items")
      .select("*")
      .eq("audit_id", audit.id)
      .order("position", { ascending: true });
    items = (refetch.data ?? []) as AuditChecklistItem[];
  }

  if (items.length === 0) notFound();

  return (
    <>
      <ModuleHeader
        title="Ejecutar auditoría"
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
      <div className="px-4 md:px-6 py-4">
        <ExecuteAudit
          audit={audit}
          items={items}
          organizationId={orgId}
          userId={user.id}
        />
      </div>
    </>
  );
}
