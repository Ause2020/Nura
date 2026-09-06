"use client";

import Link from "next/link";
import { ModuleHeader } from "@/components/layout/header";
import { TrainingNavTabs } from "@/components/training/training-nav-tabs";
import { Badge } from "@/components/ui/badge";
import {
  COMPETENCY_STATUS_LABELS,
} from "@/lib/training/constants";
import {
  summarizeMatrixCompliance,
  type CompetencyCell,
} from "@/lib/training/competency-matrix";
import { cn } from "@/lib/utils";

interface CompetencyMatrixViewProps {
  cells: CompetencyCell[];
}

function statusTone(status: CompetencyCell["status"]) {
  if (status === "current") return "bg-sage/15 text-sage";
  if (status === "expiring") return "bg-amber/15 text-amber";
  if (status === "expired" || status === "pending") return "bg-danger/10 text-danger";
  return "bg-background text-ink-faint";
}

export function CompetencyMatrixView({ cells }: CompetencyMatrixViewProps) {
  const summary = summarizeMatrixCompliance(cells);
  const users = Array.from(
    new Map(cells.map((c) => [c.userId, c.userName])).entries()
  );
  const courses = Array.from(
    new Map(cells.map((c) => [c.courseId, c.courseTitle])).entries()
  );

  const cellMap = new Map(
    cells.map((c) => [`${c.userId}:${c.courseId}`, c] as const)
  );

  return (
    <>
      <ModuleHeader
        title="Matriz de competencias"
        description={`${summary.percent}% al día (${summary.current}/${summary.total})`}
      />
      <TrainingNavTabs />

      <div className="px-6 py-4 space-y-4">
        <div className="bg-white border border-border rounded-md px-4 py-3 inline-block">
          <p className="text-xs text-ink-faint">Cumplimiento global</p>
          <p className="text-2xl font-mono font-semibold text-forest">
            {summary.percent}%
          </p>
        </div>

        {cells.length === 0 ? (
          <p className="text-sm text-ink-faint bg-white border border-border rounded-md px-4 py-8 text-center">
            Define requisitos por rol en cada curso para ver la matriz.
          </p>
        ) : (
          <div className="bg-white border border-border rounded-md overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left sticky left-0 bg-white">
                    Persona
                  </th>
                  {courses.map(([id, title]) => (
                    <th key={id} className="px-3 py-2 text-left font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(([userId, userName]) => (
                  <tr key={userId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium sticky left-0 bg-white">
                      {userName}
                    </td>
                    {courses.map(([courseId]) => {
                      const cell = cellMap.get(`${userId}:${courseId}`);
                      if (!cell) {
                        return (
                          <td key={courseId} className="px-3 py-2 text-ink-faint">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={courseId} className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-block px-2 py-1 rounded-full font-mono uppercase tracking-wide",
                              statusTone(cell.status)
                            )}
                          >
                            {COMPETENCY_STATUS_LABELS[cell.status]}
                          </span>
                          {cell.assignmentId &&
                            (cell.status === "pending" ||
                              cell.status === "expired") && (
                              <Link
                                href={`/capacitacion/cursos/${courseId}/realizar?assignment=${cell.assignmentId}`}
                                className="block text-[10px] text-forest mt-1 hover:underline"
                              >
                                Realizar
                              </Link>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {(
            Object.entries(COMPETENCY_STATUS_LABELS) as [
              CompetencyCell["status"],
              string,
            ][]
          ).map(([key, label]) => (
            <Badge key={key} variant="neutral">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}
