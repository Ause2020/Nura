"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SUBMISSION_STATUS_LABELS,
  SYNC_STATUS_LABELS,
} from "@/lib/production-records/constants";
import type {
  ProductionFormSubmission,
  ProductionFormSubmissionValue,
  ProductionFormTemplate,
} from "@/types/database";

interface ProductionSubmissionDetailProps {
  submission: ProductionFormSubmission;
  template: ProductionFormTemplate | null;
  values: ProductionFormSubmissionValue[];
}

function formatValue(row: ProductionFormSubmissionValue): string {
  if (row.field_type === "number" && row.value_number != null) {
    return String(row.value_number);
  }
  if (row.field_type === "multiselect" && Array.isArray(row.value_json)) {
    return row.value_json.join(", ");
  }
  if (row.field_type === "photo" && row.value_text) {
    return row.value_text;
  }
  if (row.field_type === "checklist") {
    if (row.value_text === "yes") return "Sí";
    if (row.value_text === "no") return "No";
    if (row.value_text === "na") return "N/A";
  }
  return row.value_text ?? "—";
}

export function ProductionSubmissionDetail({
  submission,
  template,
  values,
}: ProductionSubmissionDetailProps) {
  return (
    <div>
      <ModuleHeader
        title={template?.name ?? "Registro de producción"}
        description={new Date(submission.submitted_at).toLocaleString("es")}
        actions={
          <Link href="/registros">
            <Button type="button" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="bg-white border border-border rounded-md p-4 space-y-2">
          <p className="text-xs text-ink-faint">Estado</p>
          <Badge
            variant={
              submission.status === "ok"
                ? "success"
                : submission.status === "deviation"
                  ? "danger"
                  : "warning"
            }
          >
            {SUBMISSION_STATUS_LABELS[submission.status]}
          </Badge>
        </div>
        <div className="bg-white border border-border rounded-md p-4 space-y-2">
          <p className="text-xs text-ink-faint">Sincronización</p>
          <p className="text-sm text-ink">
            {SYNC_STATUS_LABELS[submission.sync_status]}
          </p>
        </div>
        <div className="bg-white border border-border rounded-md p-4 space-y-2">
          <p className="text-xs text-ink-faint">Lote</p>
          <p className="text-sm font-mono">{submission.lot_number ?? "—"}</p>
        </div>
      </div>

      {submission.deviation_notes && (
        <div className="mb-4 bg-red-50 border border-danger/20 rounded-md p-4">
          <p className="text-xs font-medium text-danger mb-1">
            Comentario de desviación
          </p>
          <p className="text-sm text-ink-light">{submission.deviation_notes}</p>
        </div>
      )}

      {submission.nc_id && (
        <div className="mb-4">
          <Link
            href={`/capa/${submission.nc_id}`}
            className="text-sm text-forest hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver No Conformidad vinculada
          </Link>
        </div>
      )}

      <div className="bg-white border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-faint border-b border-border">
              <th className="text-left font-medium px-4 py-2">Campo</th>
              <th className="text-left font-medium px-4 py-2">Valor</th>
              <th className="text-left font-medium px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {values.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-ink">{row.field_label}</td>
                <td className="px-4 py-2">
                  {row.field_type === "photo" && row.value_text ? (
                    <a
                      href={row.value_text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-forest hover:underline text-xs"
                    >
                      Ver foto
                    </a>
                  ) : (
                    <span className="text-ink-light">{formatValue(row)}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {row.is_out_of_range ||
                  (row.field_type === "checklist" && row.value_text === "no") ? (
                    <Badge variant="danger">Desviación</Badge>
                  ) : (
                    <Badge variant="success">OK</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {submission.operator_signature_hash && (
        <p className="text-xs font-mono text-ink-faint mt-4 truncate">
          Firma operador: {submission.operator_signature_hash.slice(0, 32)}…
        </p>
      )}
    </div>
  );
}
