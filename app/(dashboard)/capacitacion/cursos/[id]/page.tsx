import { notFound, redirect } from "next/navigation";
import { CourseDetailView } from "@/components/training/course-detail-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  TrainingAssignment,
  TrainingCourse,
  TrainingQuizQuestion,
  TrainingRoleRequirement,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CursoDetailPage({ params }: PageProps) {
  const { id } = await params;
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

  const [
    { data: courseData },
    { data: questionsData },
    { data: assignmentsData },
    { data: requirementsData },
    { data: membersData },
  ] = await Promise.all([
    supabase
      .from("training_courses")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("training_quiz_questions")
      .select("*")
      .eq("course_id", id)
      .eq("organization_id", orgId)
      .order("sort_order"),
    supabase
      .from("training_assignments")
      .select("*")
      .eq("course_id", id)
      .eq("organization_id", orgId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("training_role_requirements")
      .select("*")
      .eq("course_id", id)
      .eq("organization_id", orgId),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", orgId)
      .order("full_name"),
  ]);

  if (!courseData) notFound();

  return (
    <CourseDetailView
      course={courseData as TrainingCourse}
      questions={(questionsData ?? []) as TrainingQuizQuestion[]}
      assignments={(assignmentsData ?? []) as TrainingAssignment[]}
      requirements={(requirementsData ?? []) as TrainingRoleRequirement[]}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name" | "role">[]}
      organizationId={orgId}
      userId={user.id}
      canManage={canManage}
    />
  );
}
