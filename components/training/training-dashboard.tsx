"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, GraduationCap } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { TrainingNavTabs } from "@/components/training/training-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCategoryLabel,
  getAssignmentStatusLabel,
} from "@/lib/training/constants";
import { cn } from "@/lib/utils";
import type {
  TrainingAssignment,
  TrainingCourse,
  TrainingCourseCategory,
} from "@/types/database";

interface TrainingDashboardProps {
  courses: TrainingCourse[];
  assignments: TrainingAssignment[];
  canManage: boolean;
}

export function TrainingDashboard({
  courses,
  assignments,
  canManage,
}: TrainingDashboardProps) {
  const [catFilter, setCatFilter] = useState<TrainingCourseCategory | "">("");

  const summary = useMemo(() => {
    const active = courses.filter((c) => c.is_active).length;
    const pending = assignments.filter((a) => a.status !== "completed").length;
    const overdue = assignments.filter((a) => a.status === "overdue").length;
    return { active, pending, overdue };
  }, [courses, assignments]);

  const filtered = courses.filter((c) => {
    if (catFilter && c.category !== catFilter) return false;
    return true;
  });

  return (
    <>
      <ModuleHeader
        title="Capacitación"
        description="LMS de inocuidad alimentaria"
        actions={
          canManage ? (
            <Link href="/capacitacion/cursos/nuevo">
              <Button className="h-8">
                <Plus className="h-4 w-4" />
                Nuevo curso
              </Button>
            </Link>
          ) : undefined
        }
      />

      <TrainingNavTabs />

      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Cursos activos", value: summary.active, tone: "text-sage" },
            {
              label: "Asignaciones pendientes",
              value: summary.pending,
              tone: summary.pending > 0 ? "text-amber" : "text-ink",
            },
            {
              label: "Vencidas",
              value: summary.overdue,
              tone: summary.overdue > 0 ? "text-danger" : "text-ink",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-white border border-border rounded-md px-4 py-3"
            >
              <p className="text-xs text-ink-faint">{card.label}</p>
              <p className={cn("text-2xl font-semibold font-mono mt-1", card.tone)}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <select
          value={catFilter}
          onChange={(e) =>
            setCatFilter(e.target.value as TrainingCourseCategory | "")
          }
          className="h-8 px-2 text-xs border border-border rounded-md bg-white"
        >
          <option value="">Todas las categorías</option>
          <option value="haccp">HACCP</option>
          <option value="gmp">BPM / GMP</option>
          <option value="hygiene">Higiene</option>
          <option value="allergens">Alérgenos</option>
          <option value="safety">Seguridad</option>
          <option value="other">Otro</option>
        </select>

        {filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-md px-6 py-12 text-center">
            <GraduationCap className="h-8 w-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-light">Sin cursos registrados.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((course) => {
              const pending = assignments.filter(
                (a) => a.course_id === course.id && a.status !== "completed"
              ).length;
              return (
                <Link
                  key={course.id}
                  href={`/capacitacion/cursos/${course.id}`}
                  className="bg-white border border-border rounded-md p-4 hover:border-forest transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{course.title}</p>
                      <p className="text-xs text-ink-faint mt-1 line-clamp-2">
                        {course.description ?? "Sin descripción"}
                      </p>
                    </div>
                    <Badge variant={course.is_active ? "success" : "neutral"}>
                      {course.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <Badge variant="neutral">
                      {getCategoryLabel(course.category)}
                    </Badge>
                    <span className="font-mono text-ink-faint">
                      Vigencia {course.validity_months}m
                    </span>
                    {pending > 0 && (
                      <Badge variant="warning">
                        {pending} pendiente{pending > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
