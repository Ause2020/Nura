import { redirect } from "next/navigation";
import { CompetencyMatrixView } from "@/components/training/competency-matrix-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { buildCompetencyMatrix } from "@/lib/training/competency-matrix";
import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  TrainingAssignment,
  TrainingCompletion,
  TrainingCourse,
  TrainingRoleRequirement,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function MatrizCompetenciasPage() {
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

  const [
    { data: membersData },
    { data: coursesData },
    { data: requirementsData },
    { data: assignmentsData },
    { data: completionsData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", orgId)
      .order("full_name"),
    supabase
      .from("training_courses")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("training_role_requirements")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("training_assignments")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("training_completions")
      .select("*")
      .eq("organization_id", orgId)
      .order("completed_at", { ascending: false }),
  ]);

  const cells = buildCompetencyMatrix({
    members: (membersData ?? []) as Pick<Profile, "id" | "full_name" | "role">[],
    courses: (coursesData ?? []) as TrainingCourse[],
    requirements: (requirementsData ?? []) as TrainingRoleRequirement[],
    assignments: (assignmentsData ?? []) as TrainingAssignment[],
    completions: (completionsData ?? []) as TrainingCompletion[],
  });

  return <CompetencyMatrixView cells={cells} />;
}
