"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SUBMISSION_STATUS_LABELS } from "@/lib/production-records/constants";
import { MONITORING_SOURCE_LABELS } from "@/lib/production-records/qr";
import type {
  MonitoringSource,
  ProductionFormSubmission,
  ProductionFormTemplate,
  ProductionSubmissionStatus,
} from "@/types/database";

interface HistoricoTableProps {
  submissions: ProductionFormSubmission[];
  templates: ProductionFormTemplate[];
}

export function HistoricoTable({ submissions, templates }: HistoricoTableProps) {
  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const [templateFilter, setTemplateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    ProductionSubmissionStatus | "all"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<MonitoringSource | "all">(
    "all"
  );

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (templateFilter !== "all" && s.template_id !== templateFilter) {
        return false;
      }
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (sourceFilter !== "all" && (s.source ?? "form") !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [submissions, templateFilter, statusFilter, sourceFilter]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          <option value="all">Todas las plantillas</option>
          {templates.map((t) => (
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
        </select>
        <select
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(e.target.value as typeof sourceFilter)
          }
          className="h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          <option value="all">Todos los orígenes</option>
          <option value="qr">Terreno (QR)</option>
          <option value="form">En planta</option>
          <option value="ocr">Digitalizado</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-border rounded-md p-8 text-center space-y-2">
          <ClipboardList className="h-10 w-10 text-ink-faint mx-auto" />
          <p className="text-sm text-ink-light">
            Todavía no hay registros. Genera un QR o digitaliza una planilla.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-faint border-b border-border">
                <th className="text-left font-medium px-4 py-3">Fecha</th>
                <th className="text-left font-medium px-4 py-3">Plantilla</th>
                <th className="text-left font-medium px-4 py-3">Origen</th>
                <th className="text-left font-medium px-4 py-3">Monitor</th>
                <th className="text-left font-medium px-4 py-3">Lote</th>
                <th className="text-left font-medium px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const template = templateMap.get(row.template_id);
                const source = row.source ?? "form";
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
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          source === "qr"
                            ? "success"
                            : source === "ocr"
                              ? "warning"
                              : "neutral"
                        }
                        showDot={false}
                      >
                        {MONITORING_SOURCE_LABELS[source]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-light text-xs">
                      {row.monitor_name ?? "—"}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
