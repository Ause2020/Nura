"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { ComplaintNavTabs } from "@/components/complaints/complaint-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getComplaintTypeLabel,
  getSeverityLabel,
  getStatusLabel,
  severityBadgeVariant,
  statusBadgeVariant,
} from "@/lib/complaints/constants";
import {
  computeComplaintMetrics,
  daysOpen,
  filterComplaintsByTab,
  type ComplaintTab,
} from "@/lib/complaints/utils";
import { filterOverdueComplaints } from "@/lib/complaints/analytics";
import { slaStatusLabel } from "@/lib/complaints/sla";
import { cn } from "@/lib/utils";
import type {
  ComplaintSeverity,
  ComplaintType,
  CustomerComplaint,
  HaccpProduct,
} from "@/types/database";

interface ComplaintsDashboardProps {
  complaints: CustomerComplaint[];
  products: HaccpProduct[];
  slaHours: number;
}

const TABS: { id: ComplaintTab; label: string }[] = [
  { id: "open", label: "Abiertos" },
  { id: "investigating", label: "En investigación" },
  { id: "closed", label: "Cerrados" },
];

export function ComplaintsDashboard({
  complaints,
  products,
  slaHours,
}: ComplaintsDashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ComplaintTab>("open");
  const [typeFilter, setTypeFilter] = useState<ComplaintType | "">("");
  const [severityFilter, setSeverityFilter] = useState<ComplaintSeverity | "">(
    ""
  );
  const [productFilter, setProductFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const metrics = useMemo(
    () => computeComplaintMetrics(complaints, slaHours),
    [complaints, slaHours]
  );

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of complaints) {
      if (c.customer_name.trim()) names.add(c.customer_name.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
  }, [complaints]);

  const filtered = useMemo(() => {
    let list = filterComplaintsByTab(complaints, tab);
    if (typeFilter) list = list.filter((c) => c.complaint_type === typeFilter);
    if (severityFilter) {
      list = list.filter((c) => c.severity === severityFilter);
    }
    if (productFilter) {
      list = list.filter((c) => c.product_id === productFilter);
    }
    if (customerFilter) {
      list = list.filter((c) => c.customer_name === customerFilter);
    }
    if (overdueOnly) {
      const overdueIds = new Set(
        filterOverdueComplaints(list).map((c) => c.id)
      );
      list = list.filter((c) => overdueIds.has(c.id));
    }
    return list.sort(
      (a, b) =>
        new Date(b.received_date).getTime() -
        new Date(a.received_date).getTime()
    );
  }, [
    complaints,
    tab,
    typeFilter,
    severityFilter,
    productFilter,
    customerFilter,
    overdueOnly,
  ]);

  const cards = [
    {
      label: "Reclamos este mes",
      value: metrics.thisMonth,
      tone: "text-ink",
    },
    {
      label: "Tiempo promedio respuesta",
      value: `${metrics.avgResponseDays} d`,
      tone:
        metrics.avgResponseDays > metrics.responseTargetDays
          ? "text-danger"
          : "text-ink",
    },
    {
      label: "Inocuidad crítica abiertos",
      value: metrics.criticalOpen,
      tone: metrics.criticalOpen > 0 ? "text-danger" : "text-ink",
    },
    {
      label: "Tasa de recurrencia",
      value: `${metrics.recurrenceRate}%`,
      tone: metrics.recurrenceRate > 10 ? "text-amber" : "text-ink",
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Reclamos de clientes"
        description={`${complaints.length} registrados`}
        actions={
          <Link href="/reclamos/nuevo">
            <Button className="h-8">
              <Plus className="h-4 w-4" />
              Nuevo reclamo
            </Button>
          </Link>
        }
      />

      <ComplaintNavTabs />

      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-white border border-border rounded-md px-4 py-3"
            >
              <p className="text-xs text-ink-faint">{card.label}</p>
              <p
                className={cn(
                  "text-2xl font-semibold font-mono mt-1",
                  card.tone
                )}
              >
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-forest text-forest"
                  : "border-transparent text-ink-light hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as ComplaintType | "")
            }
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Tipo</option>
            <option value="foreign_body">Cuerpo extraño</option>
            <option value="deterioration">Deterioro</option>
            <option value="labeling">Etiquetado</option>
            <option value="taste_odor">Sabor / Olor</option>
            <option value="allergen">Alérgeno</option>
            <option value="packaging">Empaque</option>
            <option value="quantity">Cantidad</option>
            <option value="service">Servicio</option>
            <option value="other">Otro</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value as ComplaintSeverity | "")
            }
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Severidad</option>
            <option value="safety_critical">Seguridad crítica</option>
            <option value="quality">Calidad</option>
            <option value="labeling">Etiquetado</option>
            <option value="cosmetic">Cosmético</option>
          </select>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-border rounded-md bg-white max-w-[180px]"
          >
            <option value="">Cliente</option>
            {customerOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 h-8 px-2 text-xs border border-border rounded-md bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="accent-forest"
            />
            SLA vencido
          </label>
        </div>

        <div className="bg-white border border-border rounded-md overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <MessageSquare className="h-8 w-8 text-ink-faint mx-auto mb-3" />
              <p className="text-sm text-ink-light">
                No hay reclamos en esta vista. Registra el primero para iniciar
                el seguimiento.
              </p>
              <Link href="/reclamos/nuevo" className="inline-block mt-4">
                <Button>Nuevo reclamo</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-mono uppercase tracking-wider text-ink-faint border-b border-border">
                    <th className="px-4 py-2 text-left">N°</th>
                    <th className="px-4 py-2 text-left">Cliente</th>
                    <th className="px-4 py-2 text-left">Producto</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Severidad</th>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">SLA</th>
                    <th className="px-4 py-2 text-left">Días abierto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const openDays = daysOpen(c);
                    const sla = slaStatusLabel(c);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border last:border-0 cursor-pointer hover:bg-background"
                        onClick={() => router.push(`/reclamos/${c.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-ink">
                          {c.complaint_number}
                          {c.recurrence && (
                            <Badge variant="warning" showDot={false} className="ml-2">
                              Recurrente
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">{c.customer_name}</td>
                        <td className="px-4 py-3 text-ink-light">
                          {c.product_id
                            ? productMap.get(c.product_id) ?? "—"
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral" showDot={false}>
                            {getComplaintTypeLabel(c.complaint_type)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={severityBadgeVariant(c.severity)}
                            showDot={false}
                          >
                            {getSeverityLabel(c.severity)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                          {new Date(c.received_date).toLocaleDateString("es")}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={statusBadgeVariant(c.status)}
                            showDot={false}
                          >
                            {getStatusLabel(c.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              sla.tone === "danger"
                                ? "danger"
                                : sla.tone === "warning"
                                  ? "warning"
                                  : sla.tone === "success"
                                    ? "success"
                                    : "neutral"
                            }
                            showDot={false}
                          >
                            {sla.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "font-mono",
                              openDays > 7 && c.status !== "closed"
                                ? "text-danger"
                                : "text-ink-faint"
                            )}
                          >
                            {c.status === "closed" ? "—" : openDays}
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
      </div>
    </>
  );
}
