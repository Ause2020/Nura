import type {
  Profile,
  TrainingAssignment,
  TrainingCompetencyStatus,
  TrainingCompletion,
  TrainingCourse,
  TrainingRoleRequirement,
  UserRole,
} from "@/types/database";
import { daysUntil } from "@/lib/training/utils";

export interface CompetencyCell {
  userId: string;
  userName: string;
  userRole: UserRole;
  courseId: string;
  courseTitle: string;
  status: TrainingCompetencyStatus;
  validUntil: string | null;
  assignmentId: string | null;
}

export function buildCompetencyMatrix(input: {
  members: Pick<Profile, "id" | "full_name" | "role">[];
  courses: TrainingCourse[];
  requirements: TrainingRoleRequirement[];
  assignments: TrainingAssignment[];
  completions: TrainingCompletion[];
}): CompetencyCell[] {
  const cells: CompetencyCell[] = [];
  const latestCompletionByUserCourse = new Map<string, TrainingCompletion>();

  for (const completion of input.completions) {
    if (!completion.passed) continue;
    const key = `${completion.user_id}:${completion.course_id}`;
    const existing = latestCompletionByUserCourse.get(key);
    if (
      !existing ||
      new Date(completion.completed_at).getTime() >
        new Date(existing.completed_at).getTime()
    ) {
      latestCompletionByUserCourse.set(key, completion);
    }
  }

  const reqsByCourse = new Map<string, TrainingRoleRequirement[]>();
  for (const req of input.requirements) {
    const list = reqsByCourse.get(req.course_id) ?? [];
    list.push(req);
    reqsByCourse.set(req.course_id, list);
  }

  for (const member of input.members) {
    for (const course of input.courses.filter((c) => c.is_active)) {
      const reqs = reqsByCourse.get(course.id) ?? [];
      const required =
        reqs.length === 0 ||
        reqs.some(
          (r) => r.target_role === "all" || r.target_role === member.role
        );

      if (!required) continue;

      const completion = latestCompletionByUserCourse.get(
        `${member.id}:${course.id}`
      );
      const openAssignment = input.assignments.find(
        (a) =>
          a.user_id === member.id &&
          a.course_id === course.id &&
          a.status !== "completed"
      );

      let status: TrainingCompetencyStatus = "not_assigned";
      let validUntil: string | null = null;
      let assignmentId: string | null = openAssignment?.id ?? null;

      if (completion?.valid_until) {
        validUntil = completion.valid_until;
        const days = daysUntil(completion.valid_until);
        if (days < 0) status = "expired";
        else if (days <= 30) status = "expiring";
        else status = "current";
      } else if (openAssignment) {
        status =
          openAssignment.status === "overdue" ? "expired" : "pending";
        assignmentId = openAssignment.id;
      } else if (required) {
        status = "not_assigned";
      }

      cells.push({
        userId: member.id,
        userName: member.full_name,
        userRole: member.role,
        courseId: course.id,
        courseTitle: course.title,
        status,
        validUntil,
        assignmentId,
      });
    }
  }

  return cells;
}

export function summarizeMatrixCompliance(cells: CompetencyCell[]): {
  total: number;
  current: number;
  percent: number;
} {
  const total = cells.length;
  const current = cells.filter((c) => c.status === "current").length;
  const percent = total > 0 ? Math.round((current / total) * 100) : 100;
  return { total, current, percent };
}
