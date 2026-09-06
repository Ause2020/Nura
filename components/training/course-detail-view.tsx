"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  getCategoryLabel,
  getAssignmentStatusLabel,
  ROLE_OPTIONS,
  TRAINING_CATEGORIES,
} from "@/lib/training/constants";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TrainingAssignment,
  TrainingCourse,
  TrainingQuizQuestion,
  TrainingRoleRequirement,
  UserRole,
} from "@/types/database";

interface CourseDetailViewProps {
  course: TrainingCourse;
  questions: TrainingQuizQuestion[];
  assignments: TrainingAssignment[];
  requirements: TrainingRoleRequirement[];
  members: Pick<Profile, "id" | "full_name" | "role">[];
  organizationId: string;
  userId: string;
  canManage: boolean;
}

export function CourseDetailView({
  course: initialCourse,
  questions: initialQuestions,
  assignments: initialAssignments,
  requirements: initialRequirements,
  members,
  organizationId,
  userId,
  canManage,
}: CourseDetailViewProps) {
  const router = useRouter();
  const [course, setCourse] = useState(initialCourse);
  const [questions, setQuestions] = useState(initialQuestions);
  const [assignments] = useState(initialAssignments);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAssign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const target = form.get("target") as string;
    const dueDate = String(form.get("due_date")) || null;
    const supabase = createClient();

    let userIds: string[] = [];
    if (target === "selected") {
      userIds = [String(form.get("user_id"))];
    } else if (target === "all") {
      userIds = members.map((m) => m.id);
    } else {
      userIds = members
        .filter((m) => m.role === target)
        .map((m) => m.id);
    }

    if (userIds.length === 0) {
      setLoading(false);
      setError("No hay usuarios para asignar");
      return;
    }

    const rows = userIds.map((uid) => ({
      organization_id: organizationId,
      course_id: course.id,
      user_id: uid,
      due_date: dueDate,
      status: "assigned" as const,
      assigned_by: userId,
    }));

    const { error: insertError } = await supabase
      .from("training_assignments")
      .insert(rows);

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.refresh();
  }

  async function toggleRoleRequirement(role: UserRole | "all") {
    if (!canManage) return;
    const supabase = createClient();
    const existing = requirements.find((r) => r.target_role === role);

    if (existing) {
      await supabase
        .from("training_role_requirements")
        .delete()
        .eq("id", existing.id);
      setRequirements((prev) => prev.filter((r) => r.id !== existing.id));
    } else {
      const { data } = await supabase
        .from("training_role_requirements")
        .insert({
          organization_id: organizationId,
          course_id: course.id,
          target_role: role,
        })
        .select("*")
        .single();
      if (data) setRequirements((prev) => [...prev, data as TrainingRoleRequirement]);
    }
  }

  async function addQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const options = [
      String(form.get("opt_a")).trim(),
      String(form.get("opt_b")).trim(),
      String(form.get("opt_c")).trim(),
      String(form.get("opt_d")).trim(),
    ].filter(Boolean);

    if (options.length < 2) {
      setError("Agrega al menos 2 opciones");
      return;
    }

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("training_quiz_questions")
      .insert({
        organization_id: organizationId,
        course_id: course.id,
        question_text: String(form.get("question_text")).trim(),
        options,
        correct_index: Number(form.get("correct_index")) || 0,
        sort_order: questions.length,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al agregar pregunta");
      return;
    }

    setQuestions((prev) => [...prev, data as TrainingQuizQuestion]);
    e.currentTarget.reset();
  }

  async function deleteQuestion(id: string) {
    const supabase = createClient();
    await supabase.from("training_quiz_questions").delete().eq("id", id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <>
      <ModuleHeader
        title={course.title}
        description={getCategoryLabel(course.category)}
        actions={
          <Link href="/capacitacion">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant={course.is_active ? "success" : "neutral"}>
            {course.is_active ? "Activo" : "Inactivo"}
          </Badge>
          <Badge variant="neutral">Vigencia {course.validity_months} meses</Badge>
          {course.has_quiz && (
            <Badge variant="neutral">Quiz · mín. {course.min_pass_score}%</Badge>
          )}
        </div>

        {course.description && (
          <p className="text-sm text-ink-light max-w-3xl">{course.description}</p>
        )}

        {canManage && (
          <>
            <section className="bg-white border border-border rounded-md p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">Requisito por rol (matriz)</h3>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((role) => {
                  const active = requirements.some(
                    (r) => r.target_role === role.value
                  );
                  return (
                    <Button
                      key={role.value}
                      type="button"
                      variant={active ? "primary" : "ghost"}
                      className="h-8"
                      onClick={() => toggleRoleRequirement(role.value)}
                    >
                      {role.label}
                    </Button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-border rounded-md p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">Asignar curso</h3>
              <form onSubmit={handleAssign} className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                    Destinatarios
                  </label>
                  <select
                    name="target"
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                    <option value="selected">Usuario específico</option>
                  </select>
                </div>
                <Input name="due_date" label="Fecha límite" type="date" />
                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                    Usuario (si aplica)
                  </label>
                  <select
                    name="user_id"
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <Button type="submit" loading={loading}>
                    Asignar
                  </Button>
                </div>
              </form>
            </section>

            {course.has_quiz && (
              <section className="bg-white border border-border rounded-md p-4 space-y-4">
                <h3 className="text-sm font-semibold text-ink">Preguntas del quiz</h3>
                <ul className="space-y-2">
                  {questions.map((q, idx) => (
                    <li
                      key={q.id}
                      className="border border-border rounded-md p-3 text-sm flex justify-between gap-2"
                    >
                      <div>
                        <p className="font-medium">{idx + 1}. {q.question_text}</p>
                        <ul className="mt-1 text-xs text-ink-faint list-disc pl-4">
                          {q.options.map((opt, i) => (
                            <li key={i}>
                              {opt}
                              {i === q.correct_index ? " ✓" : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteQuestion(q.id)}
                        className="text-danger shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={addQuestion} className="space-y-3 border-t border-border pt-4">
                  <Textarea name="question_text" label="Nueva pregunta" required />
                  <div className="grid md:grid-cols-2 gap-2">
                    <Input name="opt_a" label="Opción A" required />
                    <Input name="opt_b" label="Opción B" required />
                    <Input name="opt_c" label="Opción C" />
                    <Input name="opt_d" label="Opción D" />
                  </div>
                  <Input
                    name="correct_index"
                    label="Índice correcto (0=A, 1=B…)"
                    type="number"
                    defaultValue={0}
                    min={0}
                    max={3}
                  />
                  <Button type="submit" variant="ghost" className="h-8">
                    <Plus className="h-4 w-4" />
                    Agregar pregunta
                  </Button>
                </form>
              </section>
            )}
          </>
        )}

        <section className="bg-white border border-border rounded-md p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">Asignaciones ({assignments.length})</h3>
          {assignments.length === 0 ? (
            <p className="text-sm text-ink-faint">Sin asignaciones.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {assignments.slice(0, 20).map((a) => {
                const member = members.find((m) => m.id === a.user_id);
                return (
                  <li key={a.id} className="py-2 flex justify-between gap-2">
                    <span>{member?.full_name ?? a.user_id}</span>
                    <Badge variant="neutral">
                      {getAssignmentStatusLabel(a.status)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </>
  );
}
