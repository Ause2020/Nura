import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AuditTemplateBuilder } from "@/components/auditorias/audit-template-builder";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevaPlantillaAuditoriaPage() {
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
    redirect("/auditorias/plantillas");
  }

  return (
    <>
      <ModuleHeader
        title="Nueva plantilla"
        description="Checklist configurable para auditorías"
        actions={
          <Link href="/auditorias/plantillas">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />
      <div className="px-6 py-4 max-w-3xl">
        <AuditTemplateBuilder organizationId={orgId} userId={user.id} />
      </div>
    </>
  );
}
