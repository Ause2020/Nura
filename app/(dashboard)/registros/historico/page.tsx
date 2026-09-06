import { redirect } from "next/navigation";
import { PccMonitoringPanel } from "@/components/haccp-plan/pcc-monitoring-panel";
import { ModuleHeader } from "@/components/layout/header";
import { HistoricoCharts } from "@/components/production-records/historico-charts";
import { HistoricoTable } from "@/components/production-records/historico-table";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { getPccMonitoringContract } from "@/lib/haccp-plan/monitoring-contract";
import { listMonitoringRecords } from "@/lib/haccp-plan/monitoring-records";
import { buildHistoricoDays } from "@/lib/production-records/historico";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductionFormSubmission,
  ProductionFormTemplate,
} from "@/types/database";

export default async function HistoricoPage() {
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [
    { data: submissionsData },
    { data: templatesData },
    pccForms,
    pccRecords,
  ] = await Promise.all([
    supabase
      .from("production_form_submissions")
      .select(
        "id, template_id, submitted_at, status, has_deviation, area, sync_status, lot_number, source, monitor_name"
      )
      .eq("organization_id", orgId)
      .order("submitted_at", { ascending: false })
      .limit(500),
    supabase
      .from("production_form_templates")
      .select("id, name, area, is_active")
      .eq("organization_id", orgId)
      .order("name"),
    getPccMonitoringContract(orgId, supabase),
    listMonitoringRecords(orgId, supabase),
  ]);

  const submissions = (submissionsData ?? []) as ProductionFormSubmission[];
  const days = buildHistoricoDays(submissions);

  return (
    <>
      <ModuleHeader
        title="Histórico"
        description="Resultados de QR, formularios y planillas digitalizadas"
      />
      <MonitoreoNav />
      <div className="px-6 py-6 space-y-6 max-w-5xl">
        <HistoricoCharts days={days} />
        <HistoricoTable
          submissions={submissions}
          templates={(templatesData ?? []) as ProductionFormTemplate[]}
        />
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
            PCC del plan HACCP
          </h2>
          <PccMonitoringPanel
            organizationId={orgId}
            userId={user.id}
            forms={pccForms}
            initialRecords={pccRecords}
          />
        </section>
      </div>
    </>
  );
}
