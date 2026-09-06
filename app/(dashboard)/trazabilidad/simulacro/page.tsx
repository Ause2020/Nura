import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { TraceabilityNavTabs } from "@/components/traceability/traceability-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDuration,
  MOCK_RECALL_STATUS_LABELS,
} from "@/lib/traceability/constants";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { MockRecallSimulation } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function SimulacroListPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("mock_recall_simulations")
    .select("*")
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false });

  const simulations = (data ?? []) as MockRecallSimulation[];

  return (
    <>
      <ModuleHeader
        title="Simulacros de retiro"
        description="Historial de mock recall"
        actions={
          <Link href="/trazabilidad/simulacro/nuevo">
            <Button>
              <Plus className="h-4 w-4" />
              Nuevo simulacro
            </Button>
          </Link>
        }
      />
      <TraceabilityNavTabs />
      <div className="px-6 py-4 space-y-2">
        {simulations.length === 0 ? (
          <p className="text-sm text-ink-light">Sin simulacros registrados.</p>
        ) : (
          simulations.map((sim) => (
            <Link
              key={sim.id}
              href={`/trazabilidad/simulacro/${sim.id}`}
              className="block bg-white border border-border rounded-md px-4 py-3 hover:border-sage/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-forest">
                    {sim.simulation_number}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {new Date(sim.started_at).toLocaleString("es")}
                    {sim.elapsed_seconds != null &&
                      ` · ${formatDuration(sim.elapsed_seconds)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="neutral">
                    {MOCK_RECALL_STATUS_LABELS[sim.status]}
                  </Badge>
                  {sim.passed_goal != null && (
                    <Badge variant={sim.passed_goal ? "success" : "danger"}>
                      {sim.passed_goal ? "≤ 4h" : "> 4h"}
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
