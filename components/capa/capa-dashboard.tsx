"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { NcFiltersBar, type NcFilters } from "@/components/capa/nc-filters";
import { NcMetrics } from "@/components/capa/nc-metrics";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getOriginLabel,
  getSeverityBadgeVariant,
  getSeverityLabel,
  getStatusBadgeVariant,
  STATUS_LABELS,
} from "@/lib/capa/constants";
import {
  computeCapaMetrics,
  filterByTab,
  isPastDue,
  truncateText,
} from "@/lib/capa/utils";
import { getStageLabel } from "@/lib/capa/workflow";
import { cn } from "@/lib/utils";
import type { CapaAction, Nonconformity, Profile } from "@/types/database";

type TabId = "open" | "in_progress" | "closed";

interface CapaDashboardProps {
  ncs: Nonconformity[];
  actionsByNc: Record<string, CapaAction[]>;
  members: Pick<Profile, "id" | "full_name">[];
}

const TABS: { id: TabId; label: string }[] = [
  { id: "open", label: "Abiertas" },
  { id: "in_progress", label: "En progreso" },
  { id: "closed", label: "Cerradas" },
];

export function CapaDashboard({ ncs, actionsByNc, members }: CapaDashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("open");
  const [filters, setFilters] = useState<NcFilters>({
    severity: "all",
    origin: "all",
    status: "all",
    responsible: "all",
    overdueOnly: false,
  });

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.full_name])),
    [members]
  );

  const metrics = useMemo(() => computeCapaMetrics(ncs), [ncs]);

  const filtered = useMemo(() => {
    let list = filterByTab(ncs, tab);
    if (filters.severity !== "all") {
      list = list.filter((nc) => nc.severity === filters.severity);
    }
    if (filters.origin !== "all") {
      list = list.filter((nc) => nc.origin === filters.origin);
    }
    if (filters.status !== "all") {
      list = list.filter((nc) => nc.status === filters.status);
    }
    if (filters.responsible !== "all") {
      list = list.filter((nc) => nc.assigned_to === filters.responsible);
    }
    if (filters.overdueOnly) {
      list = list.filter(
        (nc) => nc.status !== "closed" && isPastDue(nc.due_date, nc.status)
      );
    }
    return list.sort(
      (a, b) =>
        new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
    );
  }, [ncs, tab, filters]);

  function getResponsible(nc: Nonconformity): string {
    if (nc.assigned_to) {
      return memberMap.get(nc.assigned_to) ?? "—";
    }
    const actions = actionsByNc[nc.id] ?? [];
    const pending = actions.find((a) => a.status !== "completed");
    return pending?.responsible ?? actions[0]?.responsible ?? "—";
  }

  return (
    <>
      <ModuleHeader
        title="No Conformidades"
        description="CAPA — acciones correctivas y preventivas"
        actions={
          <Link href="/capa/nueva">
            <Button>
              <Plus className="h-4 w-4" />
              Nueva NC
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-4">
        <NcMetrics {...metrics} />

        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm transition-colors duration-150 border-b-2 -mb-px",
                tab === t.id
                  ? "text-forest font-medium border-forest"
                  : "text-ink-faint border-transparent hover:text-ink-light"
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs font-mono text-ink-faint">
                {filterByTab(ncs, t.id).length}
              </span>
            </button>
          ))}
        </div>

        <NcFiltersBar
          filters={filters}
          onChange={setFilters}
          responsibles={members.map((m) => ({ id: m.id, name: m.full_name }))}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Sin no conformidades"
            description={
              tab === "closed"
                ? "Las NC cerradas aparecerán aquí"
                : "Registra una NC manualmente o genera una desde monitoreo o auditorías"
            }
            actionLabel={tab !== "closed" ? "Registrar NC" : undefined}
            onAction={
              tab !== "closed" ? () => router.push("/capa/nueva") : undefined
            }
          />
        ) : (
          <div className="bg-white rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent cursor-default">
                  <TableHead>N° NC</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Etapa CAPA</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((nc) => {
                  const overdue = isPastDue(nc.due_date, nc.status);
                  return (
                    <TableRow
                      key={nc.id}
                      onClick={() => router.push(`/capa/${nc.id}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {nc.nc_number}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" showDot={false}>
                          {getOriginLabel(nc.origin)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {truncateText(nc.description)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSeverityBadgeVariant(nc.severity)}>
                          {getSeverityLabel(nc.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-ink-light">
                        {nc.area ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" showDot={false}>
                          {getStageLabel(nc.capa_stage ?? "identification")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-ink-light">
                        {getResponsible(nc)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-xs",
                          overdue && "text-danger font-medium"
                        )}
                      >
                        {nc.due_date
                          ? new Date(nc.due_date).toLocaleDateString("es")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(nc.status)}>
                          {STATUS_LABELS[nc.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
