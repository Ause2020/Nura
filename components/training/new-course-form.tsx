"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TRAINING_CATEGORIES } from "@/lib/training/constants";
import { createClient } from "@/lib/supabase/client";
import type { TrainingCourseCategory, TrainingContentType } from "@/types/database";

interface NewCourseFormProps {
  organizationId: string;
  userId: string;
}

export function NewCourseForm({ organizationId, userId }: NewCourseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contentType, setContentType] = useState<TrainingContentType>("text");
  const [hasQuiz, setHasQuiz] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data, error: insertError } = await supabase
      .from("training_courses")
      .insert({
        organization_id: organizationId,
        title: String(form.get("title")).trim(),
        description: String(form.get("description")).trim() || null,
        category: form.get("category") as TrainingCourseCategory,
        content_type: contentType,
        content_text:
          contentType === "text"
            ? String(form.get("content_text")).trim() || null
            : null,
        content_url:
          contentType === "url"
            ? String(form.get("content_url")).trim() || null
            : null,
        validity_months: Number(form.get("validity_months")) || 12,
        min_pass_score: Number(form.get("min_pass_score")) || 80,
        has_quiz: hasQuiz,
        created_by: userId,
      })
      .select("id")
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al crear curso");
      return;
    }

    router.push(`/capacitacion/cursos/${(data as { id: string }).id}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title="Nuevo curso"
        description="Capacitación de inocuidad"
        actions={
          <Link href="/capacitacion">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="px-6 py-4 max-w-2xl space-y-4 bg-white border border-border rounded-md p-6"
      >
        <Input name="title" label="Título" required />
        <Textarea name="description" label="Descripción" className="min-h-[4rem]" />

        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
            Categoría
          </label>
          <select
            name="category"
            defaultValue="haccp"
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {TRAINING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Input
            name="validity_months"
            label="Vigencia (meses)"
            type="number"
            defaultValue={12}
            min={1}
          />
          <Input
            name="min_pass_score"
            label="Puntaje mínimo (%)"
            type="number"
            defaultValue={80}
            min={0}
            max={100}
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasQuiz}
            onChange={(e) => setHasQuiz(e.target.checked)}
            className="accent-forest"
          />
          Incluye evaluación (quiz)
        </label>

        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
            Contenido
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={contentType === "text" ? "primary" : "ghost"}
              className="h-8"
              onClick={() => setContentType("text")}
            >
              Texto
            </Button>
            <Button
              type="button"
              variant={contentType === "url" ? "primary" : "ghost"}
              className="h-8"
              onClick={() => setContentType("url")}
            >
              Enlace externo
            </Button>
          </div>
          {contentType === "text" ? (
            <Textarea
              name="content_text"
              label="Contenido del curso"
              className="min-h-[8rem]"
            />
          ) : (
            <Input name="content_url" label="URL del material" type="url" />
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" loading={loading}>
          Crear curso
        </Button>
      </form>
    </>
  );
}
