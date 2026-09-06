"use client";

import { useMemo } from "react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ComplaintNavTabs } from "@/components/complaints/complaint-nav-tabs";
import { ComplaintSlaSettings } from "@/components/complaints/complaint-sla-settings";
import { ComplaintTrendsPanel } from "@/components/complaints/complaint-trends-panel";
import {
  getComplaintTypeLabel,
  getSeverityLabel,
} from "@/lib/complaints/constants";
import {
  computeCategoryBreakdown,
  computeSlaCompliance,
} from "@/lib/complaints/analytics";
import {
  computeComplaintMetrics,
  topComplaintTypes,
} from "@/lib/complaints/utils";
import {
  parseAutoNcThreshold,
  parseSlaHours,
} from "@/lib/complaints/sla";
import type { CustomerComplaint, HaccpProduct } from "@/types/database";

interface ComplaintsAnalyticsViewProps {
  complaints: CustomerComplaint[];
  products: HaccpProduct[];
  slaHours: number;
  autoNcThreshold: unknown;
  canManageSettings: boolean;
}

export function ComplaintsAnalyticsView({
  complaints,
  products,
  slaHours,
  autoNcThreshold,
  canManageSettings,
}: ComplaintsAnalyticsViewProps) {
  const productNames = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const metrics = useMemo(
    () => computeComplaintMetrics(complaints, slaHours),
    [complaints, slaHours]
  );
  const sla = useMemo(() => computeSlaCompliance(complaints), [complaints]);
  const categories = useMemo(
    () =>
      computeCategoryBreakdown(complaints, (type) =>
        getComplaintTypeLabel(
          type as Parameters<typeof getComplaintTypeLabel>[0]
        )
      ),
    [complaints]
  );
  const severityBreakdown = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const map = new Map<string, number>();
    for (const c of complaints) {
      if (new Date(c.received_date) < since) continue;
      map.set(c.severity, (map.get(c.severity) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([severity, count]) => ({
        severity,
        label: getSeverityLabel(
          severity as Parameters<typeof getSeverityLabel>[0]
        ),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [complaints]);
  const topTypes = topComplaintTypes(complaints, (type) =>
    getComplaintTypeLabel(type as Parameters<typeof getComplaintTypeLabel>[0])
  );
  const maxCategory = Math.max(...categories.map((c) => c.count), 1);

  return (
    <>
      <ModuleHeader
        title="Reclamos de clientes"
        description="Analítica y cumplimiento SLA"
      />
      <ComplaintNavTabs />

      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-border rounded-md px-4 py-3">
            <p className="text-xs text-ink-faint">Cumplimiento SLA (abiertos)</p>
            <p className="text-2xl font-semibold font-mono mt-1 text-ink">
              {sla.complianceRate}%
            </p>
          </div>
          <div className="bg-white border border-border rounded-md px-4 py-3">
            <p className="text-xs text-ink-faint">SLA vencidos</p>
            <p
              className={`text-2xl font-semibold font-mono mt-1 ${
                sla.overdue > 0 ? "text-danger" : "text-ink"
              }`}
            >
              {sla.overdue}
            </p>
          </div>
          <div className="bg-white border border-border rounded-md px-4 py-3">
            <p className="text-xs text-ink-faint">Por vencer (24h)</p>
            <p
              className={`text-2xl font-semibold font-mono mt-1 ${
                sla.dueSoon > 0 ? "text-amber" : "text-ink"
              }`}
            >
              {sla.dueSoon}
            </p>
          </div>
          <div className="bg-white border border-border rounded-md px-4 py-3">
            <p className="text-xs text-ink-faint">Meta respuesta</p>
            <p className="text-2xl font-semibold font-mono mt-1 text-ink">
              {metrics.slaHours}h
            </p>
            <p className="text-[10px] text-ink-faint">
              ≈ {metrics.responseTargetDays} días
            </p>
          </div>
        </div>

        {canManageSettings && (
          <ComplaintSlaSettings
            slaHours={parseSlaHours(slaHours)}
            autoNcThreshold={parseAutoNcThreshold(autoNcThreshold)}
          />
        )}

        <div className="bg-white border border-border rounded-md p-4">
          <ComplaintTrendsPanel
            complaints={complaints}
            productNames={productNames}
            slaHours={slaHours}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-border rounded-md p-4">
            <p className="text-xs font-mono uppercase text-ink-faint mb-3">
              Por categoría (90 días)
            </p>
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-xs text-ink-light">Sin datos</p>
              ) : (
                categories.map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate text-ink-light">{c.label}</span>
                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sage rounded-full"
                        style={{ width: `${(c.count / maxCategory) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono w-6 text-right">{c.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-md p-4">
            <p className="text-xs font-mono uppercase text-ink-faint mb-3">
              Por severidad (90 días)
            </p>
            <div className="space-y-2">
              {severityBreakdown.length === 0 ? (
                <p className="text-xs text-ink-light">Sin datos</p>
              ) : (
                severityBreakdown.map((s) => (
                  <div
                    key={s.severity}
                    className="flex items-center justify-between text-xs border-b border-border py-1"
                  >
                    <Badge variant="neutral" showDot={false}>
                      {s.label}
                    </Badge>
                    <span className="font-mono">{s.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-md p-4">
          <p className="text-xs font-mono uppercase text-ink-faint mb-3">
            NC automáticas generadas
          </p>
          <p className="text-sm text-ink">
            {complaints.filter((c) => c.auto_nc_created).length} de{" "}
            {complaints.length} reclamos
          </p>
          {topTypes.length > 0 && (
            <p className="text-xs text-ink-faint mt-2">
              Tipo más frecuente: {topTypes[0]?.label} ({topTypes[0]?.count})
            </p>
          )}
        </div>
      </div>
    </>
  );
}
