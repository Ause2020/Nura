import { HaccpPlanWizard } from "@/components/haccp-plan/haccp-plan-wizard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { getOrCreateActivePlan } from "@/lib/haccp-plan/data-service";
import {
  getStepDataForSteps,
  requiredStepDataIds,
} from "@/lib/haccp-plan/step-data-service";
import { startNavTimer, timeNav } from "@/lib/perf/dev-time";
import { rscNavCtx } from "@/lib/perf/rsc-nav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HaccpPlanPage() {
  const nav = await rscNavCtx("/haccp");
  const endPage = startNavTimer("PAGE", "total", nav);
  const organizationId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  try {
    const details = await timeNav("PAGE", "getOrCreateActivePlan", nav, () =>
      getOrCreateActivePlan(organizationId, user.id, supabase)
    );
    const needed = requiredStepDataIds(details.plan.currentStep);
    const stepData =
      needed.length === 0
        ? {}
        : await timeNav("PAGE", "getStepDataForSteps", nav, () =>
            getStepDataForSteps(organizationId, needed, supabase)
          );
    endPage();
    return (
      <HaccpPlanWizard
        organizationId={organizationId}
        userId={user.id}
        initial={details}
        initialStepData={stepData}
      />
    );
  } catch (error) {
    endPage();
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
