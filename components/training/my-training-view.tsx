"use client";

import Link from "next/link";
import { ModuleHeader } from "@/components/layout/header";
import { TrainingNavTabs } from "@/components/training/training-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPETENCY_STATUS_LABELS,
  getCategoryLabel,
  getAssignmentStatusLabel,
} from "@/lib/training/constants";
import { cn } from "@/lib/utils";
import type {
  TrainingAssignment,
  TrainingCourse,
  TrainingCompletion,
} from "@/types/database";

interface MyTrainingViewProps {
  assignments: (TrainingAssignment & { course?: TrainingCourse })[];
  completions: TrainingCompletion[];
}

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "overdue") return "danger" as const;
  if (status === "in_progress") return "warning" as const;
  return "neutral" as const;
}

export function MyTrainingView({
  assignments,
  completions,
}: MyTrainingViewProps) {
  const pending = assignments.filter((a) => a.status !== "completed");
  const done = completions.filter((c) => c.passed);

  return (
    <>
      <ModuleHeader
        title="Mis capacitaciones"
        description={`${pending.length} pendiente(s) · ${done.length} completada(s)`}
      />
      <TrainingNavTabs />

      <div className="px-6 py-4 space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Pendientes</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-ink-faint bg-white border border-border rounded-md px-4 py-6 text-center">
              No tienes capacitaciones pendientes.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((assignment) => (
                <div
                  key={assignment.id}
                  className="bg-white border border-border rounded-md p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {assignment.course?.title ?? "Curso"}
                    </p>
                    <p className="text-xs text-ink-faint mt-1">
                      {assignment.course
                        ? getCategoryLabel(assignment.course.category)
                        : ""}
                      {assignment.due_date &&
                        ` · Vence ${new Date(assignment.due_date).toLocaleDateString("es")}`}
                      {assignment.nc_id && " · Vinculada a CAPA"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(assignment.status)}>
                      {getAssignmentStatusLabel(assignment.status)}
                    </Badge>
                    <Link
                      href={`/capacitacion/cursos/${assignment.course_id}/realizar?assignment=${assignment.id}`}
                    >
                      <Button className="h-8">Realizar</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Completadas</h2>
          {done.length === 0 ? (
            <p className="text-sm text-ink-faint">Sin historial aún.</p>
          ) : (
            <div className="bg-white border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-mono uppercase tracking-wider text-ink-faint border-b border-border">
                    <th className="px-4 py-2 text-left">Certificado</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Vigencia</th>
                    <th className="px-4 py-2 text-left">Puntaje</th>
                    <th className="px-4 py-2 text-left" />
                  </tr>
                </thead>
                <tbody>
                  {done.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{c.certificate_code}</td>
                      <td className="px-4 py-3">
                        {new Date(c.completed_at).toLocaleDateString("es")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                        {c.valid_until
                          ? new Date(c.valid_until).toLocaleDateString("es")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono">{c.score ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/capacitacion/certificado/${c.id}`}
                          className="text-xs text-forest hover:underline"
                        >
                          Ver certificado
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
