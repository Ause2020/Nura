import { redirect } from "next/navigation";
import { GenerarMonitoreo } from "@/components/production-records/generar-monitoreo";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { MonitoringQrLink, ProductionFormTemplate } from "@/types/database";

export default async function GenerarMonitoreoPage() {
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: templates }, { data: links }] = await Promise.all([
    supabase
      .from("production_form_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("monitoring_qr_links")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <>
      <ModuleHeader
        title="Generar monitoreo"
        description="QR para que el monitor de calidad registre en terreno"
      />
      <MonitoreoNav />
      <GenerarMonitoreo
        templates={(templates ?? []) as ProductionFormTemplate[]}
        links={(links ?? []) as MonitoringQrLink[]}
        organizationId={orgId}
        userId={user.id}
      />
    </>
  );
}
