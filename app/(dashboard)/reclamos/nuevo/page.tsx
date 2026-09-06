import { redirect } from "next/navigation";
import { NewComplaintForm } from "@/components/complaints/new-complaint-form";
import { generateComplaintNumber } from "@/lib/complaints/utils";
import { parseSlaHours } from "@/lib/complaints/sla";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/anthropic";
import type { CustomerComplaint, HaccpProduct } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoReclamoPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [
    { data: orgData },
    { data: productsData },
    { data: complaintsData },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("complaint_response_sla_hours, complaint_auto_nc_severity")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("haccp_products")
      .select("*")
      .eq("organization_id", orgId)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("customer_complaints")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  const org = orgData as {
    complaint_response_sla_hours?: number | null;
    complaint_auto_nc_severity?: string | null;
  } | null;

  const initialNumber = await generateComplaintNumber(supabase, orgId);

  return (
    <NewComplaintForm
      organizationId={orgId}
      userId={user.id}
      products={(productsData ?? []) as HaccpProduct[]}
      initialNumber={initialNumber}
      existingComplaints={(complaintsData ?? []) as CustomerComplaint[]}
      slaHours={parseSlaHours(org?.complaint_response_sla_hours)}
      autoNcThreshold={org?.complaint_auto_nc_severity}
      aiAvailable={isAiConfigured()}
    />
  );
}
