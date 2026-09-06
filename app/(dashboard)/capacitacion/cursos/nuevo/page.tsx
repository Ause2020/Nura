import { redirect } from "next/navigation";
import { NewCourseForm } from "@/components/training/new-course-form";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoCursoPage() {
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
  if (role === "operator") redirect("/capacitacion/mis-capacitaciones");

  return <NewCourseForm organizationId={orgId} userId={user.id} />;
}
