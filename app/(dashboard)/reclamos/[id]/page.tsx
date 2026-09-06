import { notFound, redirect } from "next/navigation";
import {
  ComplaintDetailView,
  type LotTraceability,
} from "@/components/complaints/complaint-detail-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CapaAction,
  ComplaintPhoto,
  ComplaintStatusLog,
  CustomerComplaint,
  HaccpProduct,
  Nonconformity,
  TraceEvent,
  TraceLot,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReclamoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [
    { data: complaintData },
    { data: photosData },
    { data: allComplaintsData },
    { data: statusLogData },
    { data: teamData },
  ] = await Promise.all([
    supabase
      .from("customer_complaints")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("complaint_photos")
      .select("*")
      .eq("complaint_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("customer_complaints")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("complaint_status_log")
      .select("*")
      .eq("complaint_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .order("full_name"),
  ]);

  if (!complaintData) notFound();

  const complaint = complaintData as CustomerComplaint;

  let product: HaccpProduct | null = null;
  if (complaint.product_id) {
    const { data: productData } = await supabase
      .from("haccp_products")
      .select("*")
      .eq("id", complaint.product_id)
      .maybeSingle();
    product = (productData as HaccpProduct | null) ?? null;
  }

  let linkedNc: Nonconformity | null = null;
  let ncActions: CapaAction[] = [];
  if (complaint.nc_id) {
    const [{ data: ncData }, { data: actionsData }] = await Promise.all([
      supabase
        .from("nonconformities")
        .select("*")
        .eq("id", complaint.nc_id)
        .maybeSingle(),
      supabase
        .from("capa_actions")
        .select("*")
        .eq("nc_id", complaint.nc_id),
    ]);
    linkedNc = (ncData as Nonconformity | null) ?? null;
    ncActions = (actionsData ?? []) as CapaAction[];
  }

  let traceability: LotTraceability | null = null;
  if (complaint.lot_number) {
    const [
      { data: lotsData },
      { data: ncsData },
    ] = await Promise.all([
      supabase
        .from("trace_lots")
        .select("*")
        .eq("organization_id", orgId)
        .eq("lot_code", complaint.lot_number),
      supabase
        .from("nonconformities")
        .select("*")
        .eq("organization_id", orgId)
        .eq("lot_number", complaint.lot_number),
    ]);

    const traceLots = (lotsData ?? []) as TraceLot[];
    let traceEvents: TraceEvent[] = [];
    if (traceLots.length > 0) {
      const { data: eventsData } = await supabase
        .from("trace_events")
        .select("*")
        .eq("organization_id", orgId)
        .in(
          "lot_id",
          traceLots.map((l) => l.id)
        )
        .order("event_at", { ascending: false });
      traceEvents = (eventsData ?? []) as TraceEvent[];
    }

    traceability = {
      traceLots,
      traceEvents,
      relatedNcs: (ncsData ?? []) as Nonconformity[],
    };
  }

  return (
    <ComplaintDetailView
      complaint={complaint}
      photos={(photosData ?? []) as ComplaintPhoto[]}
      product={product}
      linkedNc={linkedNc}
      ncActions={ncActions}
      allComplaints={(allComplaintsData ?? []) as CustomerComplaint[]}
      traceability={traceability}
      statusLog={(statusLogData ?? []) as ComplaintStatusLog[]}
      teamMembers={
        (teamData ?? []) as { id: string; full_name: string }[]
      }
      organizationId={orgId}
      userId={user.id}
    />
  );
}
