/**
 * Integración CAPA → Capacitación (Paso 8).
 */

import type { TrainingAssignment } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export async function asignarCapacitacionCorrectiva(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    ncId: string;
    courseTitle: string;
    userIds: string[];
    assignedBy: string;
    dueDate?: string;
  }
): Promise<{ assignmentIds: string[] } | null> {
  if (input.userIds.length === 0) return null;

  const { data: existingCourse } = await supabase
    .from("training_courses")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("title", input.courseTitle)
    .maybeSingle();

  let courseId = (existingCourse as { id: string } | null)?.id;

  if (!courseId) {
    const { data: createdCourse, error: courseError } = await supabase
      .from("training_courses")
      .insert({
        organization_id: input.organizationId,
        title: input.courseTitle,
        description: `Capacitación correctiva vinculada a CAPA`,
        category: "other",
        content_type: "text",
        content_text:
          "Completa esta capacitación correctiva como parte del plan de acción de la no conformidad vinculada.",
        validity_months: 12,
        min_pass_score: 80,
        has_quiz: false,
        created_by: input.assignedBy,
      })
      .select("id")
      .single();

    if (courseError || !createdCourse) return null;
    courseId = (createdCourse as { id: string }).id;
  }

  const dueDate =
    input.dueDate ??
    new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  const rows = input.userIds.map((userId) => ({
    organization_id: input.organizationId,
    course_id: courseId!,
    user_id: userId,
    due_date: dueDate,
    status: "assigned" as const,
    nc_id: input.ncId,
    assigned_by: input.assignedBy,
    notes: "Asignación correctiva desde CAPA",
  }));

  const { data, error } = await supabase
    .from("training_assignments")
    .insert(rows)
    .select("id");

  if (error || !data) return null;

  const assignmentIds = (data as Pick<TrainingAssignment, "id">[]).map(
    (r) => r.id
  );

  const { notifyOrgManagers } = await import("@/lib/notifications");
  for (const userId of input.userIds) {
    await supabase.from("notifications").insert({
      organization_id: input.organizationId,
      user_id: userId,
      type: "training_due",
      title: "Capacitación asignada",
      message: `${input.courseTitle} — vence el ${dueDate}`,
      link: "/capacitacion/mis-capacitaciones",
      dedup_key: `training-cap-${input.ncId}-${userId}-${courseId}`,
    });
  }

  await notifyOrgManagers(supabase, input.organizationId, {
    type: "system",
    title: "Capacitación correctiva asignada",
    message: `${assignmentIds.length} asignación(es) para CAPA`,
    link: `/capa/${input.ncId}`,
    dedupKey: `training-capa-${input.ncId}`,
  });

  return { assignmentIds };
}

export async function countPendingCapaTraining(
  supabase: SupabaseClient,
  ncId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("training_assignments")
    .select("id", { count: "exact", head: true })
    .eq("nc_id", ncId)
    .neq("status", "completed");

  if (error) return 0;
  return count ?? 0;
}
