"use client";

import { Badge } from "@/components/ui/badge";
import {
  getLotTypeLabel,
  TRACE_EVENT_TYPE_LABELS,
} from "@/lib/traceability/constants";
import type { TraceTreeNode } from "@/lib/traceability/graph";
import { cn } from "@/lib/utils";
import type { TraceEvent, TraceLot } from "@/types/database";

interface TraceTreeViewProps {
  upstream: TraceTreeNode;
  downstream: TraceTreeNode;
  events?: TraceEvent[];
}

function LotNode({
  node,
  depth = 0,
}: {
  node: TraceTreeNode;
  depth?: number;
}) {
  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border pl-3")}>
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <span className="font-mono text-sm text-forest font-medium">
          {node.lot.lot_code}
        </span>
        <Badge variant="neutral" showDot={false}>
          {getLotTypeLabel(node.lot.lot_type)}
        </Badge>
        {node.lot.product_name && (
          <span className="text-xs text-ink-light">{node.lot.product_name}</span>
        )}
        {node.lot.quantity != null && (
          <span className="text-xs font-mono text-ink-faint">
            {node.lot.quantity} {node.lot.quantity_unit ?? ""}
          </span>
        )}
        {node.lot.destination && (
          <span className="text-xs text-ink-faint">→ {node.lot.destination}</span>
        )}
        {node.edgeLabel && (
          <span className="text-xs text-amber">({node.edgeLabel})</span>
        )}
      </div>
      {node.children.map((child) => (
        <LotNode key={child.lot.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function TraceTreeView({ upstream, downstream, events = [] }: TraceTreeViewProps) {
  return (
    <div id="trace-tree-print" className="space-y-6">
      <section className="bg-white border border-border rounded-md p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-3">
          Hacia atrás (origen / materias)
        </h3>
        {upstream.children.length === 0 ? (
          <p className="text-sm text-ink-light">Sin materias registradas upstream.</p>
        ) : (
          upstream.children.map((child) => (
            <LotNode key={child.lot.id} node={child} />
          ))
        )}
      </section>

      <section className="bg-sage-light/30 border border-sage/20 rounded-md p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-forest mb-2">
          Lote consultado
        </h3>
        <LotNode node={upstream} />
      </section>

      <section className="bg-white border border-border rounded-md p-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-3">
          Hacia adelante (destino / productos derivados)
        </h3>
        {downstream.children.length === 0 ? (
          <p className="text-sm text-ink-light">
            Sin productos derivados registrados downstream.
          </p>
        ) : (
          downstream.children.map((child) => (
            <LotNode key={child.lot.id} node={child} />
          ))
        )}
      </section>

      {events.length > 0 && (
        <section className="bg-white border border-border rounded-md p-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-3">
            Eventos críticos (CTE)
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap gap-2 text-xs border-b border-border pb-2 last:border-0"
              >
                <Badge variant="neutral" showDot={false}>
                  {TRACE_EVENT_TYPE_LABELS[event.event_type]}
                </Badge>
                <span className="text-ink-faint">
                  {new Date(event.event_at).toLocaleString("es")}
                </span>
                {event.location && (
                  <span className="text-ink-light">{event.location}</span>
                )}
                {event.notes && (
                  <span className="text-ink-light">{event.notes}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function TraceLotHeader({ lot }: { lot: TraceLot }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="font-mono text-lg font-semibold text-forest">{lot.lot_code}</h2>
      <Badge variant="neutral">{getLotTypeLabel(lot.lot_type)}</Badge>
      {lot.product_name && (
        <span className="text-sm text-ink-light">{lot.product_name}</span>
      )}
    </div>
  );
}
