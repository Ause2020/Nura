import { HaccpPlanWizard } from "@/components/haccp-plan/haccp-plan-wizard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { getOrCreateActivePlan } from "@/lib/haccp-plan/data-service";
import { getAllStepData } from "@/lib/haccp-plan/step-data-service";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HaccpPlanPage() {
  const organizationId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  let details;
  try {
    details = await getOrCreateActivePlan(organizationId, user.id, supabase);
  } catch (error) {
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

  const stepData = await getAllStepData(organizationId, supabase);

  return (
    <HaccpPlanWizard
      organizationId={organizationId}
      userId={user.id}
      initial={details}
      initialStepData={stepData}
    />
  );
}
