import { redirect } from "next/navigation";
import { PlantKioskView } from "@/components/dashboard/plant-kiosk-view";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { loadKioskSnapshot } from "@/lib/kiosk/snapshot";
import { createClient } from "@/lib/supabase/server";

export default async function PlantaKioskPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: orgData }, snapshot] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    loadKioskSnapshot(supabase, orgId),
  ]);

  const orgName = (orgData as { name?: string } | null)?.name ?? "Planta";

  return <PlantKioskView initial={snapshot} organizationName={orgName} />;
}
