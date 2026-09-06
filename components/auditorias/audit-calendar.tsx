"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AuditNavTabs } from "@/components/auditorias/audit-nav-tabs";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAuditTypeLabel,
  getStatusBadgeVariant,
  STATUS_LABELS,
} from "@/lib/audit/constants";
import {
  formatMonthYear,
  getCalendarAuditsByDate,
  toDateKey,
} from "@/lib/audit/trends";
import { cn } from "@/lib/utils";
import type { Audit } from "@/types/database";

interface AuditCalendarProps {
  audits: Audit[];
}

export function AuditCalendar({ audits }: AuditCalendarProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const auditsByDate = useMemo(
    () => getCalendarAuditsByDate(audits),
    [audits]
  );

  const monthLabel = formatMonthYear(cursor);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function shiftMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1));
  }

  return (
    <>
      <ModuleHeader
        title="Auditorías"
        description="Calendario de auditorías programadas"
      />
      <AuditNavTabs />

      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="h-8" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold text-ink capitalize">
            {monthLabel}
          </h2>
          <Button variant="ghost" className="h-8" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-white border border-border rounded-md overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-zinc-50">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-xs font-mono uppercase text-ink-faint text-center"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, index) => {
              if (day === null) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[88px] border-b border-r border-border bg-zinc-50/50"
                  />
                );
              }

              const dateKey = toDateKey(new Date(year, month, day));
              const dayAudits = auditsByDate.get(dateKey) ?? [];
              const isToday = dateKey === toDateKey(new Date());

              return (
                <div
                  key={dateKey}
                  className={cn(
                    "min-h-[88px] border-b border-r border-border p-1.5 align-top",
                    isToday && "bg-sage-light/50"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-mono",
                      isToday ? "text-forest font-semibold" : "text-ink-faint"
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayAudits.slice(0, 2).map((audit) => (
                      <Link
                        key={audit.id}
                        href={
                          audit.status === "completed"
                            ? `/auditorias/${audit.id}/informe`
                            : `/auditorias/${audit.id}/ejecutar`
                        }
                        className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-sage-light text-forest truncate hover:opacity-80"
                        title={audit.title}
                      >
                        {audit.title}
                      </Link>
                    ))}
                    {dayAudits.length > 2 && (
                      <p className="text-[10px] text-ink-faint px-1">
                        +{dayAudits.length - 2} más
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint">
            Próximas auditorías
          </h3>
          {audits.filter(
            (a) =>
              a.status === "scheduled" || a.status === "in_progress"
          ).length === 0 ? (
            <p className="text-sm text-ink-light">Sin auditorías pendientes</p>
          ) : (
            <div className="space-y-2">
              {audits
                .filter(
                  (a) =>
                    a.status === "scheduled" || a.status === "in_progress"
                )
                .slice(0, 8)
                .map((audit) => (
                  <div
                    key={audit.id}
                    className="bg-white border border-border rounded-md px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {audit.title}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {audit.scheduled_date} ·{" "}
                        {getAuditTypeLabel(audit.audit_type)}
                        {audit.site_area ? ` · ${audit.site_area}` : ""}
                      </p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(audit.status)}>
                      {STATUS_LABELS[audit.status]}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
