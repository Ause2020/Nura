"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  computeQuizScore,
  computeTrainingSignatureHash,
  computeValidUntil,
  generateCertificateCode,
} from "@/lib/training/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  TrainingAssignment,
  TrainingCourse,
  TrainingQuizQuestion,
} from "@/types/database";

interface CoursePlayerProps {
  course: TrainingCourse;
  questions: TrainingQuizQuestion[];
  assignment: TrainingAssignment;
  userId: string;
  organizationId: string;
}

export function CoursePlayer({
  course,
  questions,
  assignment,
  userId,
  organizationId,
}: CoursePlayerProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>(
    questions.map(() => -1)
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleComplete(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!course.has_quiz && !acknowledged) {
      setLoading(false);
      setError("Confirma que revisaste el contenido");
      return;
    }

    if (course.has_quiz) {
      if (answers.some((a) => a < 0)) {
        setLoading(false);
        setError("Responde todas las preguntas");
        return;
      }
      if (questions.length === 0) {
        setLoading(false);
        setError("El curso no tiene preguntas configuradas");
        return;
      }
    }

    const score = course.has_quiz
      ? computeQuizScore(answers, questions)
      : 100;
    const passed = score >= course.min_pass_score;

    if (!passed) {
      setLoading(false);
      setError(`Puntaje ${score}% — necesitas ${course.min_pass_score}%`);
      return;
    }

    const supabase = createClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const signatureHash = await computeTrainingSignatureHash({
      userId,
      courseId: course.id,
      assignmentId: assignment.id,
      timestamp: nowIso,
      score,
    });
    const certificateCode = generateCertificateCode();
    const validUntil = computeValidUntil(now, course.validity_months);

    const { data: completion, error: completionError } = await supabase
      .from("training_completions")
      .insert({
        organization_id: organizationId,
        assignment_id: assignment.id,
        user_id: userId,
        course_id: course.id,
        score,
        passed: true,
        signature_hash: signatureHash,
        valid_until: validUntil,
        certificate_code: certificateCode,
      })
      .select("id")
      .single();

    if (completionError || !completion) {
      setLoading(false);
      setError(completionError?.message ?? "Error al registrar");
      return;
    }

    await supabase
      .from("training_assignments")
      .update({ status: "completed" })
      .eq("id", assignment.id);

    setLoading(false);
    router.push(
      `/capacitacion/certificado/${(completion as { id: string }).id}`
    );
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title={course.title}
        description="Realizar capacitación"
        actions={
          <Link href="/capacitacion/mis-capacitaciones">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleComplete} className="px-6 py-4 max-w-2xl space-y-6">
        <div className="bg-white border border-border rounded-md p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Contenido</h3>
          {course.content_type === "url" && course.content_url ? (
            <a
              href={course.content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-forest hover:underline"
            >
              Abrir material
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <div className="text-sm text-ink-light whitespace-pre-wrap">
              {course.content_text ?? "Sin contenido."}
            </div>
          )}
        </div>

        {course.has_quiz ? (
          <div className="bg-white border border-border rounded-md p-4 space-y-4">
            <h3 className="text-sm font-semibold text-ink">Evaluación</h3>
            {questions.map((q, qi) => (
              <fieldset key={q.id} className="space-y-2">
                <legend className="text-sm font-medium text-ink">
                  {qi + 1}. {q.question_text}
                </legend>
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={answers[qi] === oi}
                      onChange={() =>
                        setAnswers((prev) => {
                          const next = [...prev];
                          next[qi] = oi;
                          return next;
                        })
                      }
                      className="accent-forest"
                    />
                    {opt}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm bg-white border border-border rounded-md p-4">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="accent-forest"
            />
            Confirmo que revisé el contenido del curso
          </label>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button type="submit" loading={loading} className="w-full md:w-auto">
          Finalizar y obtener certificado
        </Button>
      </form>
    </>
  );
}
