import { redirect } from "next/navigation";
import { MyTrainingView } from "@/components/training/my-training-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  TrainingAssignment,
  TrainingCompletion,
  TrainingCourse,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function MisCapacitacionesPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: assignmentsData }, { data: completionsData }, { data: coursesData }] =
    await Promise.all([
      supabase
        .from("training_assignments")
        .select("*")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("training_completions")
        .select("*")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false }),
      supabase
        .from("training_courses")
        .select("*")
        .eq("organization_id", orgId),
    ]);

  const courses = (coursesData ?? []) as TrainingCourse[];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const assignments = ((assignmentsData ?? []) as TrainingAssignment[]).map(
    (a) => ({
      ...a,
      course: courseById.get(a.course_id),
    })
  );

  return (
    <MyTrainingView
      assignments={assignments}
      completions={(completionsData ?? []) as TrainingCompletion[]}
    />
  );
}
