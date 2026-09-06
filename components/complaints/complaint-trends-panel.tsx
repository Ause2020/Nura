"use client";

import {
  getComplaintTypeLabel,
} from "@/lib/complaints/constants";
import {
  computeComplaintMetrics,
  computeMonthlyComplaintTrend,
  topComplaintTypes,
  topProductsByComplaints,
} from "@/lib/complaints/utils";
import type { CustomerComplaint } from "@/types/database";

interface ComplaintTrendsPanelProps {
  complaints: CustomerComplaint[];
  productNames: Map<string, string>;
  slaHours?: number;
}

export function ComplaintTrendsPanel({
  complaints,
  productNames,
  slaHours,
}: ComplaintTrendsPanelProps) {
  const metrics = computeComplaintMetrics(complaints, slaHours);
  const monthly = computeMonthlyComplaintTrend(complaints);
  const topTypes = topComplaintTypes(complaints, (type) =>
    getComplaintTypeLabel(type as Parameters<typeof getComplaintTypeLabel>[0])
  );
  const topProducts = topProductsByComplaints(complaints, productNames);

  const maxMonthly = Math.max(...monthly.map((m) => m.count), 1);
  const maxTypes = Math.max(...topTypes.map((t) => t.count), 1);

  const width = 280;
  const height = 100;
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = height - pad;

  const linePath = monthly
    .map((m, i) => {
      const x = pad + (i / Math.max(monthly.length - 1, 1)) * innerW;
      const y = pad + innerH - (m.count / maxMonthly) * innerH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono">
        Reclamos de clientes — trimestre
      </h3>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-faint mb-2">Evolución mensual</p>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <path
              d={linePath}
              fill="none"
              stroke="#1B4332"
              strokeWidth={2}
            />
            {monthly.map((m, i) => {
              const x = pad + (i / Math.max(monthly.length - 1, 1)) * innerW;
              const y = pad + innerH - (m.count / maxMonthly) * innerH;
              return (
                <text
                  key={m.label}
                  x={x}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#A09890"
                  fontFamily="monospace"
                >
                  {m.label}
                </text>
              );
            })}
          </svg>
        </div>

        <div>
          <p className="text-xs text-ink-faint mb-2">Tiempo respuesta vs. meta</p>
          <div className="flex items-end gap-2 h-20">
            <div className="flex-1 text-center">
              <div
                className="bg-sage rounded-t mx-auto w-12"
                style={{
                  height: `${Math.min(100, (metrics.avgResponseDays / 10) * 100)}%`,
                  minHeight: 8,
                }}
              />
              <p className="text-xs font-mono mt-1">{metrics.avgResponseDays}d</p>
              <p className="text-[10px] text-ink-faint">Promedio</p>
            </div>
            <div className="flex-1 text-center">
              <div
                className="bg-amber/60 rounded-t mx-auto w-12"
                style={{
                  height: `${(metrics.responseTargetDays / 10) * 100}%`,
                  minHeight: 8,
                }}
              />
              <p className="text-xs font-mono mt-1">
                {metrics.responseTargetDays}d
              </p>
              <p className="text-[10px] text-ink-faint">Meta</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-ink-faint mb-2">Top tipos (trimestre)</p>
          <div className="space-y-2">
            {topTypes.length === 0 ? (
              <p className="text-xs text-ink-light">Sin datos</p>
            ) : (
              topTypes.map((t) => (
                <div key={t.type} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-ink-light">{t.label}</span>
                  <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-forest rounded-full"
                      style={{ width: `${(t.count / maxTypes) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono w-6 text-right">{t.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-ink-faint mb-2">Top productos</p>
          <ul className="text-xs space-y-1">
            {topProducts.length === 0 ? (
              <li className="text-ink-light">Sin datos</li>
            ) : (
              topProducts.map((p) => (
                <li
                  key={p.productId}
                  className="flex justify-between border-b border-border py-1"
                >
                  <span className="text-ink-light truncate pr-2">
                    {p.productName}
                  </span>
                  <span className="font-mono">{p.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
