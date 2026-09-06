"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList, Plus, Settings2 } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SUBMISSION_STATUS_LABELS,
  SYNC_STATUS_LABELS,
} from "@/lib/production-records/constants";
import { cn } from "@/lib/utils";
import type {
  ProductionFormSubmission,
  ProductionFormTemplate,
  ProductionSubmissionStatus,
} from "@/types/database";

interface ProductionRecordsDashboardProps {
  submissions: ProductionFormSubmission[];
  templates: ProductionFormTemplate[];
  canManage: boolean;
}

export function ProductionRecordsDashboard({
  submissions,
  templates,
  canManage,
}: ProductionRecordsDashboardProps) {
  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );

  const [templateFilter, setTemplateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    ProductionSubmissionStatus | "all"
  >("all");
  const [areaFilter, setAreaFilter] = useState("");

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) {
      if (s.area) set.add(s.area);
    }
    for (const t of templates) {
      if (t.area) set.add(t.area);
    }
    return Array.from(set).sort();
  }, [submissions, templates]);

  const filtered = useMemo(() => {
    return submissions
      .filter((s) => {
        if (templateFilter !== "all" && s.template_id !== templateFilter) {
          return false;
        }
        if (statusFilter !== "all" && s.status !== statusFilter) {
          return false;
        }
        if (
          areaFilter &&
          !(s.area ?? "").toLowerCase().includes(areaFilter.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() -
          new Date(a.submitted_at).getTime()
      );
  }, [submissions, templateFilter, statusFilter, areaFilter]);

  return (
    <div>
      <ModuleHeader
        title="Monitoreo"
        description="Historial de formularios de PCC y controles en planta"
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Link href="/registros/plantillas">
                <Button type="button" variant="secondary">
                  <Settings2 className="h-4 w-4" />
                  Plantillas
                </Button>
              </Link>
            )}
            <Link href="/registros/plantillas">
              <Button type="button">
                <Plus className="h-4 w-4" />
                Ejecutar formulario
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          <option value="all">Todas las plantillas</option>
          {templates
            .filter((t) => t.is_active)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as typeof statusFilter)
          }
          className="h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          <option value="all">Todos los estados</option>
          <option value="ok">Conforme</option>
          <option value="deviation">Con desviación</option>
          <option value="pending_sync">Pendiente de sincronizar</option>
        </select>
        {areas.length > 0 && (
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-md p-8 text-center space-y-4">
          <ClipboardList className="h-10 w-10 text-ink-faint mx-auto" />
          <p className="text-sm text-ink-light">
            Aún no hay registros. Ejecuta una plantilla desde el listado de
            formularios.
          </p>
          <Link href="/registros/plantillas">
            <Button type="button">Ver plantillas</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-faint border-b border-border">
                <th className="text-left font-medium px-4 py-3">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Plantilla</th>
                <th className="text-left font-medium px-4 py-3">Área</th>
                <th className="text-left font-medium px-4 py-3">Lote</th>
                <th className="text-left font-medium px-4 py-3">Estado</th>
                <th className="text-left font-medium px-4 py-3">Sync</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const template = templateMap.get(row.template_id);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0 hover:bg-background/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ink-light">
                      <Link
                        href={`/registros/${row.id}`}
                        className="text-forest hover:underline"
                      >
                        {new Date(row.submitted_at).toLocaleString("es")}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{template?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-light">
                      {row.area ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.lot_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          row.status === "ok"
                            ? "success"
                            : row.status === "deviation"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {SUBMISSION_STATUS_LABELS[row.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs",
                          row.sync_status === "pending_sync"
                            ? "text-amber"
                            : "text-ink-faint"
                        )}
                      >
                        {SYNC_STATUS_LABELS[row.sync_status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
