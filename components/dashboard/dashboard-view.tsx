"use client";

import { ModuleHeader } from "@/components/layout/header";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { MetricCards } from "@/components/dashboard/metric-cards";
import { ModuleKpiGrid } from "@/components/dashboard/module-kpi-grid";
import { NcOriginChart } from "@/components/dashboard/nc-origin-chart";
import { SystemScoreRing } from "@/components/dashboard/system-score-ring";
import { ThisWeekSection } from "@/components/dashboard/this-week-section";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { DailyInsightTeaser } from "@/components/dashboard/daily-insight-teaser";
import { getGreeting } from "@/lib/dashboard/utils";
import type { DashboardData } from "@/lib/dashboard/data";
import type { DailyInsight } from "@/lib/ai-insights/types";

interface DashboardViewProps {
  data: DashboardData;
  insight?: DailyInsight | null;
}

export function DashboardView({ data, insight }: DashboardViewProps) {
  const firstName = data.userName.split(" ")[0];

  return (
    <>
      <ModuleHeader
        title="Dashboard"
        description="Estado del sistema de inocuidad"
      />

      <div className="px-6 py-4 space-y-6">
        {insight && (
          <DailyInsightTeaser
            insight={{
              headline: insight.headline,
              summary: insight.summary,
              overallRisk: insight.overallRisk,
            }}
          />
        )}

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
            KPIs por módulo
          </h3>
          <ModuleKpiGrid widgets={data.moduleWidgets} />
        </section>

        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight">
            {getGreeting()}, {firstName}.
          </h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Tienes{" "}
            <span className="font-mono text-ink-light">
              {data.tasks.length}
            </span>{" "}
            {data.tasks.length === 1 ? "tarea pendiente" : "tareas pendientes"}{" "}
            hoy.
          </p>
        </div>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
            Hoy
          </h3>
          <TodayTasks tasks={data.tasks} />
        </section>

        <ThisWeekSection data={data.thisWeek} />

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
            Semáforo del sistema
          </h3>
          <MetricCards metrics={data.metrics} />
        </section>

        <div className="bg-white rounded-md border border-border p-6 flex flex-col md:flex-row items-center gap-8">
          <SystemScoreRing score={data.globalScore} />
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-sm font-semibold text-ink tracking-tight">
              Salud del sistema de inocuidad
            </h2>
            <p className="text-xs text-ink-faint mt-1 max-w-md">
              Promedio ponderado de completitud HACCP, monitoreo de PCC, NCs
              abiertas y auditorías al día.
            </p>
          </div>
        </div>

        <KpiGrid kpis={data.kpis} />

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-md border border-border p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-3">
              Tendencia — 6 meses
            </h3>
            <TrendChart data={data.monthlyTrend} />
          </div>
          <div className="bg-white rounded-md border border-border p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-3">
              NCs por origen
            </h3>
            <NcOriginChart data={data.ncByOrigin} />
          </div>
        </div>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
            Actividad reciente
          </h3>
          <div className="bg-white rounded-md border border-border px-4">
            <ActivityFeed items={data.activities} />
          </div>
        </section>
      </div>
    </>
  );
}
