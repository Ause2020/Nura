import { notFound, redirect } from "next/navigation";
import { CoursePlayer } from "@/components/training/course-player";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  TrainingAssignment,
  TrainingCourse,
  TrainingQuizQuestion,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assignment?: string }>;
}

export default async function RealizarCursoPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { assignment: assignmentId } = await searchParams;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!assignmentId) notFound();

  const [
    { data: courseData },
    { data: questionsData },
    { data: assignmentData },
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
      .eq("id", assignmentId)
      .eq("course_id", id)
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);

  if (!courseData || !assignmentData) notFound();
  if ((assignmentData as TrainingAssignment).status === "completed") {
    redirect("/capacitacion/mis-capacitaciones");
  }

  return (
    <CoursePlayer
      course={courseData as TrainingCourse}
      questions={(questionsData ?? []) as TrainingQuizQuestion[]}
      assignment={assignmentData as TrainingAssignment}
      userId={user.id}
      organizationId={orgId}
    />
  );
}
