import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/cached-session";

import { SupplierDetailView } from "@/components/suppliers/supplier-detail-view";

import { requireOrganizationId } from "@/lib/haccp/auth";

import { parseScorecardWeights } from "@/lib/suppliers/scorecard";

import { createClient } from "@/lib/supabase/server";

import type {

  Nonconformity,

  Supplier,

  SupplierApprovalChecklistItem,

  SupplierApprovalLog,

  SupplierApprovalResponse,

  SupplierDocument,

  SupplierEvaluation,

  SupplierIncident,

  SupplierPortalToken,

} from "@/types/database";



interface PageProps {

  params: Promise<{ id: string }>;

}



export default async function ProveedorDetailPage({ params }: PageProps) {

  const { id } = await params;

  const orgId = await requireOrganizationId();

  const supabase = await createClient();



  const user = await getSessionUser();

  if (!user) redirect("/login");



  const [

    { data: supplierData },

    { data: documentsData },

    { data: evaluationsData },

    { data: incidentsData },

    { data: checklistData },

    { data: responsesData },

    { data: approvalLogData },

    { data: orgData },

    { data: portalTokenData },

  ] = await Promise.all([

    supabase

      .from("suppliers")

      .select("*")

      .eq("id", id)

      .eq("organization_id", orgId)

      .maybeSingle(),

    supabase

      .from("supplier_documents")

      .select("*")

      .eq("supplier_id", id)

      .eq("organization_id", orgId)

      .order("created_at", { ascending: false }),

    supabase

      .from("supplier_evaluations")

      .select("*")

      .eq("supplier_id", id)

      .eq("organization_id", orgId)

      .order("evaluation_date", { ascending: false }),

    supabase

      .from("supplier_incidents")

      .select("*")

      .eq("supplier_id", id)

      .eq("organization_id", orgId)

      .order("incident_date", { ascending: false }),

    supabase

      .from("supplier_approval_checklist")

      .select("*")

      .eq("organization_id", orgId),

    supabase

      .from("supplier_approval_responses")

      .select("*")

      .eq("supplier_id", id)

      .eq("organization_id", orgId),

    supabase

      .from("supplier_approval_log")

      .select("*")

      .eq("supplier_id", id)

      .eq("organization_id", orgId)

      .order("created_at", { ascending: false }),

    supabase

      .from("organizations")

      .select("supplier_scorecard_weights")

      .eq("id", orgId)

      .maybeSingle(),

    supabase

      .from("supplier_portal_tokens")

      .select("token, expires_at")

      .eq("supplier_id", id)

      .eq("organization_id", orgId)

      .gt("expires_at", new Date().toISOString())

      .order("created_at", { ascending: false })

      .limit(1)

      .maybeSingle(),

  ]);



  if (!supplierData) notFound();



  const incidents = (incidentsData ?? []) as SupplierIncident[];

  const incidentIds = incidents.map((i) => i.id);



  let linkedNcs: Nonconformity[] = [];

  if (incidentIds.length > 0) {

    const { data: ncsByIncident } = await supabase

      .from("nonconformities")

      .select("*")

      .eq("organization_id", orgId)

      .in("origin_ref_id", incidentIds)

      .order("created_at", { ascending: false });

    linkedNcs = (ncsByIncident ?? []) as Nonconformity[];

  }



  const { data: ncsBySupplier } = await supabase

    .from("nonconformities")

    .select("*")

    .eq("organization_id", orgId)

    .eq("supplier_id", id)

    .order("created_at", { ascending: false });



  const ncMap = new Map<string, Nonconformity>();

  for (const nc of [...linkedNcs, ...((ncsBySupplier ?? []) as Nonconformity[])]) {

    ncMap.set(nc.id, nc);

  }

  linkedNcs = Array.from(ncMap.values()).sort(

    (a, b) =>

      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

  );



  const baseUrl =

    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??

    "http://localhost:3000";



  const portalToken = portalTokenData as Pick<

    SupplierPortalToken,

    "token" | "expires_at"

  > | null;



  const initialPortalUrl = portalToken

    ? `${baseUrl}/proveedor/${portalToken.token}`

    : null;



  return (

    <SupplierDetailView

      supplier={supplierData as Supplier}

      documents={(documentsData ?? []) as SupplierDocument[]}

      evaluations={(evaluationsData ?? []) as SupplierEvaluation[]}

      incidents={incidents}

      checklist={(checklistData ?? []) as SupplierApprovalChecklistItem[]}

      approvalResponses={(responsesData ?? []) as SupplierApprovalResponse[]}

      approvalLog={(approvalLogData ?? []) as SupplierApprovalLog[]}

      linkedNcs={linkedNcs}

      scorecardWeights={parseScorecardWeights(

        (orgData as { supplier_scorecard_weights?: unknown } | null)

          ?.supplier_scorecard_weights

      )}

      organizationId={orgId}

      userId={user.id}

      initialPortalUrl={initialPortalUrl}

    />

  );

}

