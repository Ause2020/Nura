"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThisWeekData, ThisWeekItem } from "@/lib/dashboard/data";

// ─── Single row inside a card ─────────────────────────────────────────────────

function WeekItem({ item }: { item: ThisWeekItem }) {
  return (
    <Link
      href={item.href}
      className="flex items-start gap-2 py-2 group hover:bg-background rounded-sm px-1 -mx-1 transition-colors"
    >
      {item.urgent && (
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
      )}
      {!item.urgent && (
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-border shrink-0" />
      )}
      <div className="min-w-0">
        <p
          className={cn(
            "text-xs font-medium truncate group-hover:text-forest transition-colors",
            item.urgent ? "text-ink" : "text-ink-light"
          )}
        >
          {item.label}
        </p>
        {item.sublabel && (
          <p className="text-[11px] text-ink-faint truncate">{item.sublabel}</p>
        )}
      </div>
    </Link>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

interface WeekCardProps {
  title: string;
  count: number;
  countLabel?: string;
  urgentCount?: number;
  icon: React.ElementType;
  items: ThisWeekItem[];
  viewAllHref: string;
  emptyText: string;
  accentClass?: string;
}

function WeekCard({
  title,
  count,
  countLabel,
  urgentCount = 0,
  icon: Icon,
  items,
  viewAllHref,
  emptyText,
  accentClass = "text-ink-light",
}: WeekCardProps) {
  const hasUrgent = urgentCount > 0;

  return (
    <div
      className={cn(
        "bg-white border rounded-md p-4 flex flex-col gap-3",
        hasUrgent ? "border-danger/40" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 shrink-0", accentClass)} />
          <span className="text-xs font-semibold text-ink">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {urgentCount > 0 && (
            <span className="text-[10px] font-mono font-bold text-white bg-danger rounded-full px-1.5 py-0.5 leading-none">
              {urgentCount}
            </span>
          )}
          <span className="text-lg font-mono font-bold text-ink leading-none">
            {count}
          </span>
          {countLabel && (
            <span className="text-[10px] text-ink-faint">{countLabel}</span>
          )}
        </div>
      </div>

      {/* Items list */}
      {items.length > 0 ? (
        <div className="divide-y divide-border/50 -my-1">
          {items.map((item) => (
            <WeekItem key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-faint py-2">{emptyText}</p>
      )}

      {/* View all */}
      {count > 0 && (
        <Link
          href={viewAllHref}
          className="text-[11px] text-forest hover:underline mt-auto pt-1 border-t border-border/50"
        >
          Ver todos →
        </Link>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface ThisWeekSectionProps {
  data: ThisWeekData;
}

export function ThisWeekSection({ data }: ThisWeekSectionProps) {
  const overdueCount = data.overdueCapaActions.length;
  const dueSoonCount = data.dueSoonCapaActions.length;
  // Merge overdue + due-soon for the CAPA card, overdue first
  const capaItems = [...data.overdueCapaActions, ...data.dueSoonCapaActions].slice(0, 5);
  const totalCapaActionItems = overdueCount + dueSoonCount;

  const urgentDeviations = data.deviationRecords.filter((i) => i.urgent).length;

  return (
    <section>
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-3">
        Esta semana
      </h3>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* NCs abiertas */}
        <WeekCard
          title="No conformidades"
          count={data.newNcs.length}
          countLabel="nuevas"
          urgentCount={data.newNcs.filter((i) => i.urgent).length}
          icon={AlertTriangle}
          items={data.newNcs}
          viewAllHref="/capa"
          emptyText="Sin NC nuevas esta semana"
          accentClass={
            data.newNcs.some((i) => i.urgent) ? "text-danger" : "text-amber-500"
          }
        />

        {/* Acciones CAPA */}
        <WeekCard
          title="Acciones CAPA"
          count={totalCapaActionItems}
          countLabel={overdueCount > 0 ? `(${overdueCount} vencidas)` : "por vencer"}
          urgentCount={overdueCount}
          icon={CheckCircle2}
          items={capaItems}
          viewAllHref="/capa"
          emptyText="Sin acciones vencidas ni próximas"
          accentClass={overdueCount > 0 ? "text-danger" : "text-amber-500"}
        />

        <WeekCard
          title="Monitoreo con desviación"
          count={data.deviationRecords.length}
          urgentCount={urgentDeviations}
          icon={ClipboardList}
          items={data.deviationRecords}
          viewAllHref="/registros"
          emptyText="Sin desviaciones esta semana"
          accentClass={
            urgentDeviations > 0 ? "text-danger" : "text-amber-500"
          }
        />

        {/* Auditorías próximas */}
        <WeekCard
          title="Auditorías próximas"
          count={data.upcomingAudits.length}
          countLabel="próx. 14 días"
          urgentCount={data.upcomingAudits.filter((i) => i.urgent).length}
          icon={ShieldCheck}
          items={data.upcomingAudits}
          viewAllHref="/auditorias"
          emptyText="Sin auditorías programadas próximas"
          accentClass="text-forest"
        />

        {/* Open NCs summary */}
        <div className="bg-sage-light/30 border border-sage/20 rounded-md p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="h-4 w-4 text-forest" />
            <span className="text-xs font-semibold text-ink">NC abiertas totales</span>
          </div>
          <p className="text-4xl font-mono font-bold text-forest leading-none mb-1">
            {data.totalOpenNcs}
          </p>
          <p className="text-xs text-ink-faint">
            No conformidades sin cerrar en el sistema
          </p>
          <Link
            href="/capa"
            className="text-[11px] text-forest hover:underline mt-3 border-t border-sage/20 pt-2"
          >
            Ver módulo CAPA →
          </Link>
        </div>
      </div>
    </section>
  );
}
