"use client";

import { cn } from "@/lib/utils";
import {
  NC_ORIGIN_CREATE_OPTIONS,
  SEVERITY_OPTIONS,
  STATUS_LABELS,
} from "@/lib/capa/constants";
import type { NcOrigin, NcSeverity, NcStatus } from "@/types/database";

export interface NcFilters {
  severity: NcSeverity | "all";
  origin: NcOrigin | "all";
  status: NcStatus | "all";
  responsible: string | "all";
  overdueOnly: boolean;
}

interface NcFiltersBarProps {
  filters: NcFilters;
  onChange: (filters: NcFilters) => void;
  responsibles?: { id: string; name: string }[];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-150",
        active
          ? "bg-sage-light text-forest border-sage/30"
          : "bg-white text-ink-light border-border hover:bg-background"
      )}
    >
      {children}
    </button>
  );
}

export function NcFiltersBar({
  filters,
  onChange,
  responsibles = [],
}: NcFiltersBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-ink-faint uppercase tracking-wider mr-1">
          Severidad
        </span>
        <Chip
          active={filters.severity === "all"}
          onClick={() => onChange({ ...filters, severity: "all" })}
        >
          Todas
        </Chip>
        {SEVERITY_OPTIONS.map((s) => (
          <Chip
            key={s.value}
            active={filters.severity === s.value}
            onClick={() => onChange({ ...filters, severity: s.value })}
          >
            {s.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-ink-faint uppercase tracking-wider mr-1">
          Origen
        </span>
        <Chip
          active={filters.origin === "all"}
          onClick={() => onChange({ ...filters, origin: "all" })}
        >
          Todos
        </Chip>
        {NC_ORIGIN_CREATE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={filters.origin === o.value}
            onClick={() => onChange({ ...filters, origin: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-ink-faint uppercase tracking-wider mr-1">
          Estado
        </span>
        <Chip
          active={filters.status === "all"}
          onClick={() => onChange({ ...filters, status: "all" })}
        >
          Todos
        </Chip>
        {(Object.keys(STATUS_LABELS) as NcStatus[]).map((status) => (
          <Chip
            key={status}
            active={filters.status === status}
            onClick={() => onChange({ ...filters, status: status })}
          >
            {STATUS_LABELS[status]}
          </Chip>
        ))}
      </div>
      {responsibles.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-ink-faint uppercase tracking-wider mr-1">
            Responsable
          </span>
          <Chip
            active={filters.responsible === "all"}
            onClick={() => onChange({ ...filters, responsible: "all" })}
          >
            Todos
          </Chip>
          {responsibles.map((r) => (
            <Chip
              key={r.id}
              active={filters.responsible === r.id}
              onClick={() => onChange({ ...filters, responsible: r.id })}
            >
              {r.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Chip
          active={filters.overdueOnly}
          onClick={() =>
            onChange({ ...filters, overdueOnly: !filters.overdueOnly })
          }
        >
          Solo vencidas
        </Chip>
      </div>
    </div>
  );
}
