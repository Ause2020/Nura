import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MockRecallRunner } from "@/components/traceability/mock-recall-runner";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  MockRecallSimulation,
  TraceLot,
  TraceLotComposition,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: { id: string };
}

export default async function SimulacroDetailPage({ params }: PageProps) {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: simData } = await supabase
    .from("mock_recall_simulations")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const simulation = simData as MockRecallSimulation | null;
  if (!simulation) notFound();

  const { data: simLotsData } = await supabase
    .from("mock_recall_simulation_lots")
    .select("lot_id")
    .eq("simulation_id", simulation.id);

  const lotIds = (simLotsData ?? []).map((r) => (r as { lot_id: string }).lot_id);

  const [{ data: targetLotsData }, { data: allLotsData }, { data: compsData }] =
    await Promise.all([
      lotIds.length > 0
        ? supabase
            .from("trace_lots")
            .select("*")
            .in("id", lotIds)
        : Promise.resolve({ data: [] }),
      supabase.from("trace_lots").select("*").eq("organization_id", orgId),
      supabase
        .from("trace_lot_compositions")
        .select("*")
        .eq("organization_id", orgId),
    ]);

  return (
    <>
      <ModuleHeader
        title={simulation.simulation_number}
        description="Simulacro de retiro (mock recall)"
        actions={
          <Link href="/trazabilidad/simulacro">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Historial
            </Button>
          </Link>
        }
      />
      <div className="px-6 py-4">
        <MockRecallRunner
          simulation={simulation}
          targetLots={(targetLotsData ?? []) as TraceLot[]}
          allLots={(allLotsData ?? []) as TraceLot[]}
          compositions={(compsData ?? []) as TraceLotComposition[]}
        />
      </div>
    </>
  );
}
