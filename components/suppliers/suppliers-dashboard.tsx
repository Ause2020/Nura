"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCategoryLabel,
  getCriticalityLabel,
  getStatusLabel,
} from "@/lib/suppliers/constants";
import { daysUntil, isEvaluationOverdue } from "@/lib/suppliers/utils";
import { cn } from "@/lib/utils";
import type {
  Supplier,
  SupplierCategory,
  SupplierCriticality,
  SupplierDocument,
  SupplierEvaluation,
  SupplierStatus,
} from "@/types/database";

export interface SupplierRow extends Supplier {
  latestClassification: string | null;
  expiredDocs: number;
  expiringDocs: number;
}

interface SuppliersDashboardProps {
  suppliers: SupplierRow[];
  documents: SupplierDocument[];
}

function statusVariant(status: SupplierStatus) {
  if (status === "approved") return "success" as const;
  if (status === "pending" || status === "in_evaluation") return "warning" as const;
  if (status === "conditional") return "warning" as const;
  return "danger" as const;
}

function criticalityVariant(c: SupplierCriticality) {
  if (c === "critical") return "danger" as const;
  if (c === "major") return "warning" as const;
  return "neutral" as const;
}

export function SuppliersDashboard({
  suppliers,
  documents,
}: SuppliersDashboardProps) {
  const router = useRouter();
  const [catFilter, setCatFilter] = useState<SupplierCategory | "">("");
  const [critFilter, setCritFilter] = useState<SupplierCriticality | "">("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatus | "">("");
  const [classFilter, setClassFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState(false);

  const summary = useMemo(() => {
    const approved = suppliers.filter((s) => s.status === "approved").length;
    const docsExpiring30 = documents.filter((d) => {
      if (!d.expiry_date) return false;
      const days = daysUntil(d.expiry_date);
      return days >= 0 && days <= 30;
    }).length;
    const evalPending = suppliers.filter(
      (s) => isEvaluationOverdue(s.next_evaluation_date)
    ).length;
    const suspended = suppliers.filter(
      (s) => s.status === "suspended" || s.status === "conditional"
    ).length;
    return { approved, docsExpiring30, evalPending, suspended };
  }, [suppliers, documents]);

  const filtered = suppliers.filter((s) => {
    if (catFilter && s.category !== catFilter) return false;
    if (critFilter && s.criticality !== critFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (classFilter && s.latestClassification !== classFilter) return false;
    if (riskFilter) {
      const highRisk =
        s.criticality === "critical" &&
        (s.expiredDocs > 0 ||
          isEvaluationOverdue(s.next_evaluation_date) ||
          s.status === "suspended" ||
          s.status === "conditional");
      if (!highRisk) return false;
    }
    return true;
  });

  const cards = [
    { label: "Aprobados", value: summary.approved, tone: "text-sage" },
    {
      label: "Docs por vencer (30d)",
      value: summary.docsExpiring30,
      tone: summary.docsExpiring30 > 0 ? "text-amber" : "text-ink",
    },
    {
      label: "Evaluación pendiente",
      value: summary.evalPending,
      tone: summary.evalPending > 0 ? "text-amber" : "text-ink",
    },
    {
      label: "Suspendidos / condicionales",
      value: summary.suspended,
      tone: summary.suspended > 0 ? "text-danger" : "text-ink",
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Proveedores"
        description={`${suppliers.length} registrados`}
        actions={
          <Link href="/proveedores/nuevo">
            <Button className="h-8">
              <Plus className="h-4 w-4" />
              Nuevo proveedor
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-white border border-border rounded-md px-4 py-3"
            >
              <p className="text-xs text-ink-faint">{card.label}</p>
              <p className={cn("text-2xl font-semibold font-mono mt-1", card.tone)}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as SupplierCategory | "")}
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Categoría</option>
            <option value="raw_material">Materia prima</option>
            <option value="packaging">Empaque</option>
            <option value="service">Servicio</option>
            <option value="equipment">Equipamiento</option>
            <option value="other">Otro</option>
          </select>
          <select
            value={critFilter}
            onChange={(e) =>
              setCritFilter(e.target.value as SupplierCriticality | "")
            }
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Criticidad</option>
            <option value="critical">Crítico</option>
            <option value="major">Mayor</option>
            <option value="minor">Menor</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SupplierStatus | "")}
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Estado</option>
            <option value="approved">Aprobado</option>
            <option value="pending">Pendiente</option>
            <option value="in_evaluation">En evaluación</option>
            <option value="conditional">Condicional</option>
            <option value="suspended">Suspendido</option>
          </select>
          <label className="inline-flex items-center gap-2 h-8 px-2 text-xs border border-border rounded-md bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={riskFilter}
              onChange={(e) => setRiskFilter(e.target.checked)}
              className="accent-forest"
            />
            Alto riesgo
          </label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-8 px-2 text-xs border border-border rounded-md bg-white"
          >
            <option value="">Clasificación</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>

        <div className="bg-white border border-border rounded-md overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Truck className="h-8 w-8 text-ink-faint mx-auto mb-3" />
              <p className="text-sm text-ink-light">
                Registra tu primer proveedor para homologación y control documental.
              </p>
              <Link href="/proveedores/nuevo" className="inline-block mt-4">
                <Button>Nuevo proveedor</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-mono uppercase tracking-wider text-ink-faint border-b border-border">
                    <th className="px-4 py-2 text-left">Nombre</th>
                    <th className="px-4 py-2 text-left">Categoría</th>
                    <th className="px-4 py-2 text-left">Criticidad</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">Clasif.</th>
                    <th className="px-4 py-2 text-left">Docs venc.</th>
                    <th className="px-4 py-2 text-left">Próx. eval.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-background"
                      onClick={() => router.push(`/proveedores/${s.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                      <td className="px-4 py-3 text-ink-light">
                        {getCategoryLabel(s.category)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={criticalityVariant(s.criticality)}
                          showDot={false}
                        >
                          {getCriticalityLabel(s.criticality)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(s.status)} showDot={false}>
                          {getStatusLabel(s.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-ink-light">
                        {s.latestClassification ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {s.expiredDocs > 0 ? (
                          <span className="font-mono text-danger">{s.expiredDocs}</span>
                        ) : (
                          <span className="text-ink-faint">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-faint">
                        {s.next_evaluation_date
                          ? new Date(s.next_evaluation_date).toLocaleDateString("es")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
