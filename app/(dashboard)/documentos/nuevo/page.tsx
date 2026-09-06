import { redirect } from "next/navigation";
import { DocumentForm } from "@/components/documents/document-form";
import { ModuleHeader } from "@/components/layout/header";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoDocumentoPage() {
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
    redirect("/documentos");
  }

  const { data: membersData } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", orgId)
    .order("full_name");

  return (
    <div>
      <ModuleHeader
        title="Nuevo documento"
        description="Registra un documento controlado con versión inicial en borrador"
      />
      <DocumentForm
        organizationId={orgId}
        userId={user.id}
        members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
      />
    </div>
  );
}
