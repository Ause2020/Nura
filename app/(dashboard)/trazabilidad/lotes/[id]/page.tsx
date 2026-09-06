import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  TraceLotHeader,
  TraceTreeView,
} from "@/components/traceability/trace-tree-view";
import { PrintTraceButton } from "@/components/traceability/print-trace-button";
import { ExportTraceButton } from "@/components/traceability/export-trace-button";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { loadGraphFromData } from "@/lib/traceability/graph";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  TraceEvent,
  TraceLot,
  TraceLotComposition,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: { id: string };
}

export default async function LoteDetailPage({ params }: PageProps) {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: lotData } = await supabase
    .from("trace_lots")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const lot = lotData as TraceLot | null;
  if (!lot) notFound();

  const [{ data: lotsData }, { data: compsData }, { data: eventsData }] =
    await Promise.all([
      supabase.from("trace_lots").select("*").eq("organization_id", orgId),
      supabase
        .from("trace_lot_compositions")
        .select("*")
        .eq("organization_id", orgId),
      supabase
        .from("trace_events")
        .select("*")
        .eq("organization_id", orgId)
        .eq("lot_id", lot.id)
        .order("event_at", { ascending: false }),
    ]);

  const allLots = (lotsData ?? []) as TraceLot[];
  const compositions = (compsData ?? []) as TraceLotComposition[];
  const events = (eventsData ?? []) as TraceEvent[];

  const graph = loadGraphFromData(lot, allLots, compositions);

  return (
    <>
      <ModuleHeader
        title="Trazabilidad de lote"
        actions={
          <div className="flex gap-2 flex-wrap">
            <ExportTraceButton
              lotId={lot.id}
              lotCode={lot.lot_code}
              organizationId={orgId}
            />
            <PrintTraceButton />
            <Link href="/trazabilidad">
              <Button variant="ghost" className="h-8">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
            </Link>
          </div>
        }
      />
      <div className="px-6 py-4 space-y-4">
        <TraceLotHeader lot={lot} />
        <TraceTreeView
          upstream={graph.upstream}
          downstream={graph.downstream}
          events={events}
        />
      </div>
    </>
  );
}
