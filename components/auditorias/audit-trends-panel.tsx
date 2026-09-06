"use client";

import { useState } from "react";
import Link from "next/link";
import { AuditNavTabs } from "@/components/auditorias/audit-nav-tabs";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import {
  buildComplianceTrendSeries,
  type ComplianceTrendSeries,
} from "@/lib/audit/trends";
import { cn } from "@/lib/utils";
import type { Audit, AuditTemplate } from "@/types/database";

interface AuditTrendsPanelProps {
  audits: Audit[];
  templates: Pick<AuditTemplate, "id" | "name">[];
}

export function AuditTrendsPanel({ audits, templates }: AuditTrendsPanelProps) {
  const [groupBy, setGroupBy] = useState<"template" | "area">("template");

  const series = buildComplianceTrendSeries(audits, templates, groupBy);
  const completedCount = audits.filter((a) => a.status === "completed").length;

  return (
    <>
      <ModuleHeader
        title="Auditorías"
        description="Histórico de % de conformidad"
      />
      <AuditNavTabs />

      <div className="px-6 py-4 space-y-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGroupBy("template")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border",
              groupBy === "template"
                ? "bg-sage-light text-forest border-sage/30"
                : "bg-white text-ink-light border-border"
            )}
          >
            Por plantilla
          </button>
          <button
            type="button"
            onClick={() => setGroupBy("area")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border",
              groupBy === "area"
                ? "bg-sage-light text-forest border-sage/30"
                : "bg-white text-ink-light border-border"
            )}
          >
            Por área / sitio
          </button>
        </div>

        {completedCount === 0 ? (
          <div className="bg-white border border-border rounded-md p-8 text-center">
            <p className="text-sm text-ink-light">
              Completa auditorías para ver tendencias de conformidad.
            </p>
          </div>
        ) : series.length === 0 ? (
          <p className="text-sm text-ink-light">Sin datos agrupables aún.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {series.map((group) => (
              <TrendCard key={group.key} group={group} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TrendCard({ group }: { group: ComplianceTrendSeries }) {
  const maxScore = 100;

  return (
    <div className="bg-white border border-border rounded-md p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
          <p className="text-xs text-ink-faint">
            Promedio: {group.average}% · {group.points.length} auditoría(s)
          </p>
        </div>
        <Badge
          variant={
            group.average >= 80
              ? "success"
              : group.average >= 60
                ? "warning"
                : "danger"
          }
        >
          {group.average}%
        </Badge>
      </div>

      <div className="space-y-2">
        {group.points.map((point) => (
          <Link
            key={point.auditId}
            href={`/auditorias/${point.auditId}/informe`}
            className="block group"
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ink-light group-hover:text-forest">
                {point.completedDate}
              </span>
              <span className="font-mono text-ink">{point.score}%</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  point.score >= 80
                    ? "bg-sage"
                    : point.score >= 60
                      ? "bg-amber"
                      : "bg-danger"
                )}
                style={{ width: `${(point.score / maxScore) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
