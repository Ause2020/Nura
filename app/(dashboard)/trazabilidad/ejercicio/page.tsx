import { redirect } from "next/navigation";
import { TraceabilityExercise } from "@/components/traceability/traceability-exercise";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function EjercicioTrazabilidadPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: orgData } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const organizationName =
    (orgData as { name: string } | null)?.name ?? "Mi Empresa";

  return <TraceabilityExercise organizationName={organizationName} />;
}
