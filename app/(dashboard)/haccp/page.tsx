import { HaccpPlanWizard } from "@/components/haccp-plan/haccp-plan-wizard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { getOrCreateActivePlan } from "@/lib/haccp-plan/data-service";
import { getAllStepData } from "@/lib/haccp-plan/step-data-service";
import { startDevTimer } from "@/lib/perf/dev-time";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HaccpPlanPage() {
  const endTimer = startDevTimer("/haccp");
  const organizationId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // getAllStepData only reads haccp_step_data by organization_id.
  // It does not use plan id and does not write, so it is safe next to
  // getOrCreateActivePlan (which may insert a plan / seed diagram+product).
  try {
    const [details, stepData] = await Promise.all([
      getOrCreateActivePlan(organizationId, user.id, supabase),
      getAllStepData(organizationId, supabase),
    ]);
    endTimer();
    return (
      <HaccpPlanWizard
        organizationId={organizationId}
        userId={user.id}
        initial={details}
        initialStepData={stepData}
      />
    );
  } catch (error) {
    endTimer();
    const message = error instanceof Error ? error.message : "Error al cargar el plan";
    return (
      <div className="px-6 py-10">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-ink">
          <p className="font-medium">El Plan HACCP de 12 pasos necesita la migración 030.</p>
          <p className="mt-1 text-ink-light">
            Ejecuta <code className="font-mono">supabase/migrations/030_haccp_plan_12_steps.sql</code>{" "}
            en el SQL Editor de Supabase. {message}
          </p>
        </div>
      </div>
    );
  }
}
