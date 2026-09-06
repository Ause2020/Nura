import type { MockRecallStatus, TraceEventType, TraceLotType } from "@/types/database";

export const TRACE_LOT_TYPE_OPTIONS: { value: TraceLotType; label: string }[] =
  [
    { value: "raw_material", label: "Materia prima" },
    { value: "finished", label: "Producto terminado" },
    { value: "wip", label: "Producto en proceso" },
  ];

export const TRACE_EVENT_TYPE_LABELS: Record<TraceEventType, string> = {
  reception: "Recepción",
  transformation: "Transformación",
  shipment: "Despacho / envío",
};

export const MOCK_RECALL_STATUS_LABELS: Record<MockRecallStatus, string> = {
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
};

export function getLotTypeLabel(type: TraceLotType): string {
  return (
    TRACE_LOT_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type
  );
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const MOCK_RECALL_GOAL_HOURS = 4;
