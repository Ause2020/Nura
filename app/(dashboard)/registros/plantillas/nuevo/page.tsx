import { redirect } from "next/navigation";
import { ProductionFormBuilder } from "@/components/production-records/production-form-builder";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevaPlantillaPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profileData as { role: UserRole } | null)?.role ?? "operator";
  if (role !== "admin" && role !== "quality_manager") {
    redirect("/registros/plantillas");
  }

  return (
    <div>
      <ModuleHeader
        title="Nueva plantilla"
        description="Constructor de formulario con secciones y campos reordenables"
      />
      <MonitoreoNav />
      <ProductionFormBuilder organizationId={orgId} userId={user.id} />
    </div>
  );
}
