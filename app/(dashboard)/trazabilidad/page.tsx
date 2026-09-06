import { redirect } from "next/navigation";
import { TraceabilityDashboard } from "@/components/traceability/traceability-dashboard";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { MockRecallSimulation, TraceLot } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  searchParams: { q?: string };
}

export default async function TrazabilidadPage({ searchParams }: PageProps) {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: lotsData }, { data: simsData }] = await Promise.all([
    supabase
      .from("trace_lots")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("mock_recall_simulations")
      .select("*")
      .eq("organization_id", orgId)
      .order("started_at", { ascending: false })
      .limit(8),
  ]);

  return (
    <TraceabilityDashboard
      lots={(lotsData ?? []) as TraceLot[]}
      recentSimulations={(simsData ?? []) as MockRecallSimulation[]}
      initialSearch={searchParams.q ?? ""}
    />
  );
}
