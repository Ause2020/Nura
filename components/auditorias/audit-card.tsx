import Link from "next/link";
import { Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComplianceRing } from "@/components/auditorias/compliance-ring";
import {
  getAuditTypeLabel,
  getStandardLabel,
  getStatusBadgeVariant,
  STATUS_LABELS,
} from "@/lib/audit/constants";
import { cn } from "@/lib/utils";
import type { Audit, AuditStatus } from "@/types/database";

interface AuditCardProps {
  audit: Audit;
  showScore?: boolean;
}

export function AuditCard({ audit, showScore = false }: AuditCardProps) {
  const statusDot: Record<AuditStatus, string> = {
    scheduled: "bg-sage",
    in_progress: "bg-amber",
    completed: "bg-sage",
    cancelled: "bg-ink-faint",
  };

  return (
    <div className="bg-white rounded-md border border-border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral" showDot={false}>
            {getAuditTypeLabel(audit.audit_type)}
          </Badge>
          <Badge variant="success" showDot={false} className="ring-1 ring-sage/30 bg-transparent text-sage">
            {getStandardLabel(audit.standard)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", statusDot[audit.status])} />
          <Badge variant={getStatusBadgeVariant(audit.status)}>
            {STATUS_LABELS[audit.status]}
          </Badge>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink tracking-tight">
          {audit.title}
        </h3>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(audit.scheduled_date).toLocaleDateString("es")}
          </span>
          {audit.auditor_name && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {audit.auditor_name}
            </span>
          )}
          {audit.site_area && (
            <span>{audit.site_area}</span>
          )}
        </div>
      </div>

      {showScore && audit.compliance_score !== null && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-ink-faint">Cumplimiento</span>
          <ComplianceRing score={Number(audit.compliance_score)} />
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-1">
        {audit.status === "completed" ? (
          <>
            <Link href={`/auditorias/${audit.id}/informe`} className="flex-1">
              <Button variant="secondary" className="w-full">
                Ver informe
              </Button>
            </Link>
          </>
        ) : audit.status === "scheduled" || audit.status === "in_progress" ? (
          <Link href={`/auditorias/${audit.id}/ejecutar`} className="flex-1">
            <Button className="w-full">
              {audit.status === "in_progress" ? "Continuar" : "Ejecutar"}
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
