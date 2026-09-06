import { redirect } from "next/navigation";
import { PlantKioskView } from "@/components/dashboard/plant-kiosk-view";
import { fetchDashboardData } from "@/lib/dashboard/data";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function PlantaKioskPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: orgData }, data] = await Promise.all([
    supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle(),
    fetchDashboardData(orgId, ""),
  ]);

  const orgName =
    (orgData as { name?: string } | null)?.name ?? "Planta";

  return <PlantKioskView data={data} organizationName={orgName} />;
}
