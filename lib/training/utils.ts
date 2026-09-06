const MS_DAY = 86400000;

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_DAY);
}

export function computeValidUntil(
  completedAt: Date,
  validityMonths: number
): string {
  const date = new Date(completedAt);
  date.setMonth(date.getMonth() + validityMonths);
  return date.toISOString().split("T")[0];
}

export function generateCertificateCode(): string {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CERT-${year}-${suffix}`;
}

export async function computeTrainingSignatureHash(input: {
  userId: string;
  courseId: string;
  assignmentId: string | null;
  timestamp: string;
  score: number | null;
}): Promise<string> {
  const payload = [
    input.userId,
    input.courseId,
    input.assignmentId ?? "",
    input.timestamp,
    input.score ?? "",
  ].join("|");

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function computeQuizScore(
  answers: number[],
  questions: { correct_index: number }[]
): number {
  if (questions.length === 0) return 100;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correct_index) correct++;
  }
  return Math.round((correct / questions.length) * 100);
}

export function syncAssignmentStatus(
  status: string,
  dueDate: string | null
): "assigned" | "in_progress" | "completed" | "overdue" {
  if (status === "completed") return "completed";
  if (dueDate && daysUntil(dueDate) < 0) return "overdue";
  if (status === "in_progress") return "in_progress";
  return "assigned";
}
