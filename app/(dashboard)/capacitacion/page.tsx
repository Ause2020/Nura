import { redirect } from "next/navigation";
import { TrainingDashboard } from "@/components/training/training-dashboard";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  TrainingAssignment,
  TrainingCourse,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function CapacitacionPage() {
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
  const canManage = role === "admin" || role === "quality_manager";

  const [{ data: coursesData }, { data: assignmentsData }] = await Promise.all([
    supabase
      .from("training_courses")
      .select("*")
      .eq("organization_id", orgId)
      .order("title"),
    supabase
      .from("training_assignments")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  return (
    <TrainingDashboard
      courses={(coursesData ?? []) as TrainingCourse[]}
      assignments={(assignmentsData ?? []) as TrainingAssignment[]}
      canManage={canManage}
    />
  );
}
