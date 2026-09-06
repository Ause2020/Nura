import { redirect } from "next/navigation";
import { ComplaintsAnalyticsView } from "@/components/complaints/complaints-analytics-view";
import { parseSlaHours } from "@/lib/complaints/sla";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { CustomerComplaint, HaccpProduct } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function ReclamosTendenciasPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: profileData }, { data: orgData }, { data: complaintsData }, { data: productsData }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("complaint_response_sla_hours, complaint_auto_nc_severity")
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

  const role = (profileData as { role?: string } | null)?.role;
  const canManageSettings = role === "admin" || role === "quality_manager";
  const org = orgData as {
    complaint_response_sla_hours?: number | null;
    complaint_auto_nc_severity?: string | null;
  } | null;

  return (
    <ComplaintsAnalyticsView
      complaints={(complaintsData ?? []) as CustomerComplaint[]}
      products={(productsData ?? []) as HaccpProduct[]}
      slaHours={parseSlaHours(org?.complaint_response_sla_hours)}
      autoNcThreshold={org?.complaint_auto_nc_severity}
      canManageSettings={canManageSettings}
    />
  );
}
