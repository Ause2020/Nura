import { redirect } from "next/navigation";
import { ComplaintsDashboard } from "@/components/complaints/complaints-dashboard";
import { parseSlaHours } from "@/lib/complaints/sla";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomerComplaint, HaccpProduct } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function ReclamosPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: orgData }, { data: complaintsData }, { data: productsData }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("complaint_response_sla_hours")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("customer_complaints")
        .select("*")
        .eq("organization_id", orgId)
        .order("received_date", { ascending: false }),
      supabase
        .from("haccp_products")
        .select("*")
        .eq("organization_id", orgId)
        .neq("status", "archived")
        .order("name"),
    ]);

  const slaHours = parseSlaHours(
    (orgData as { complaint_response_sla_hours?: number | null } | null)
      ?.complaint_response_sla_hours
  );

  return (
    <ComplaintsDashboard
      complaints={(complaintsData ?? []) as CustomerComplaint[]}
      products={(productsData ?? []) as HaccpProduct[]}
      slaHours={slaHours}
    />
  );
}
