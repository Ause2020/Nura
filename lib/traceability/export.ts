/**
 * Traceability chain export — EU 178/2002 + FSMA 204 MVP
 *
 * Walks the lot graph (one-step-back / one-step-forward) recursively,
 * fetches events for every lot in the chain, and produces a sortable
 * Excel with one row per event + lot context.
 *
 * Reuses the downloadExcel helper from lib/export/excel.ts.
 */

import { createClient } from "@/lib/supabase/client";
import { loadGraphFromData } from "@/lib/traceability/graph";
import { TRACE_EVENT_TYPE_LABELS, getLotTypeLabel } from "@/lib/traceability/constants";
import { downloadExcel } from "@/lib/export/excel";
import type { TraceEvent, TraceLot, TraceLotComposition } from "@/types/database";

// ─── Column headers (ES / EN) ─────────────────────────────────────────────────

const HEADERS_ES = {
  direction: "Dirección",
  lotCode: "Código lote",
  lotType: "Tipo lote",
  product: "Producto",
  quantity: "Cantidad",
  unit: "Unidad",
  supplier: "Proveedor",
  tlcSource: "Fuente TLC",
  cteType: "CTE (tipo evento)",
  eventDate: "Fecha evento",
  location: "Ubicación",
  refDocType: "Tipo doc. ref.",
  refDocNumber: "N° doc. ref.",
  recipientName: "Destinatario",
  recipientLocation: "Ubicación destinatario",
  notes: "Notas",
  exportedAt: "Exportado el",
  sheetChain: "Cadena trazabilidad",
  sheetLots: "Lotes involucrados",
};

const HEADERS_EN = {
  direction: "Direction",
  lotCode: "Lot code",
  lotType: "Lot type",
  product: "Product",
  quantity: "Quantity",
  unit: "Unit",
  supplier: "Supplier",
  tlcSource: "TLC source",
  cteType: "CTE (event type)",
  eventDate: "Event date",
  location: "Location",
  refDocType: "Reference doc type",
  refDocNumber: "Reference doc #",
  recipientName: "Recipient",
  recipientLocation: "Recipient location",
  notes: "Notes",
  exportedAt: "Exported on",
  sheetChain: "Traceability chain",
  sheetLots: "Lots involved",
};

type LangHeaders = typeof HEADERS_ES;

function getHeaders(lang: "es" | "en"): LangHeaders {
  return lang === "en" ? HEADERS_EN : HEADERS_ES;
}

// ─── Direction labels ─────────────────────────────────────────────────────────

const DIRECTION_LABELS = {
  es: { root: "Raíz (consultado)", upstream: "Upstream ← (origen)", downstream: "Downstream → (destino)" },
  en: { root: "Root (queried)", upstream: "Upstream ← (origin)", downstream: "Downstream → (destination)" },
};

// ─── Event type labels ────────────────────────────────────────────────────────

const EVENT_TYPE_EN: Record<string, string> = {
  reception: "Reception",
  transformation: "Transformation",
  shipment: "Shipment",
};

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportTraceChain(
  rootLotId: string,
  organizationId: string,
  lang: "es" | "en" = "es"
): Promise<void> {
  const supabase = createClient();
  const H = getHeaders(lang);
  const DIR = DIRECTION_LABELS[lang];

  // 1. Fetch all lots and compositions for the org
  const [{ data: lotsData }, { data: compsData }] = await Promise.all([
    supabase.from("trace_lots").select("*").eq("organization_id", organizationId),
    supabase.from("trace_lot_compositions").select("*").eq("organization_id", organizationId),
  ]);

  const allLots = (lotsData ?? []) as TraceLot[];
  const compositions = (compsData ?? []) as TraceLotComposition[];

  const rootLot = allLots.find((l) => l.id === rootLotId);
  if (!rootLot) throw new Error("Lote no encontrado");

  // 2. Build graph and collect all lots in the chain
  const graph = loadGraphFromData(rootLot, allLots, compositions);

  const chainLotIds = new Set<string>();
  function collectIds(lots: TraceLot[]) {
    for (const l of lots) chainLotIds.add(l.id);
  }
  collectIds(graph.allLots);
  // Also walk upstream/downstream explicitly
  function walkNode(node: import("@/lib/traceability/graph").TraceTreeNode) {
    chainLotIds.add(node.lot.id);
    for (const child of node.children) walkNode(child);
  }
  walkNode(graph.upstream);
  walkNode(graph.downstream);

  const chainIds = Array.from(chainLotIds);

  // 3. Fetch all events for every lot in the chain
  const { data: eventsData } = await supabase
    .from("trace_events")
    .select("*")
    .eq("organization_id", organizationId)
    .in("lot_id", chainIds)
    .order("event_at", { ascending: true });

  const allEvents = (eventsData ?? []) as TraceEvent[];

  // 4. Map lot_id → direction
  const lotDirectionMap = new Map<string, string>();
  function markDirection(
    node: import("@/lib/traceability/graph").TraceTreeNode,
    dir: string
  ) {
    lotDirectionMap.set(node.lot.id, dir);
    for (const child of node.children) {
      markDirection(child, dir);
    }
  }
  markDirection(graph.upstream, DIR.upstream);
  markDirection(graph.downstream, DIR.downstream);
  lotDirectionMap.set(rootLotId, DIR.root);

  // 5. Build lot lookup
  const lotById = new Map(allLots.map((l) => [l.id, l]));

  // 6. Build event rows (one row per event)
  const eventRows = allEvents.map((ev) => {
    const lot = lotById.get(ev.lot_id);
    const direction = lotDirectionMap.get(ev.lot_id) ?? DIR.upstream;
    const eventTypeLabel =
      lang === "en"
        ? (EVENT_TYPE_EN[ev.event_type] ?? ev.event_type)
        : (TRACE_EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type);

    return [
      direction,
      lot?.lot_code ?? ev.lot_id,
      lot ? getLotTypeLabel(lot.lot_type) : "—",
      lot?.product_name ?? "—",
      lot?.quantity ?? "",
      lot?.quantity_unit ?? "",
      lot?.supplier_name ?? "—",
      lot?.tlc_source ?? "—",
      eventTypeLabel,
      new Date(ev.event_at).toLocaleDateString(lang === "en" ? "en-US" : "es"),
      ev.location ?? "—",
      ev.reference_doc_type ?? "—",
      ev.reference_doc_number ?? "—",
      ev.recipient_name ?? "—",
      ev.recipient_location ?? "—",
      ev.notes ?? "—",
    ];
  });

  // 7. Build lot summary rows (sheet 2 — one row per lot in chain)
  const lotSummaryRows = chainIds.map((id) => {
    const lot = lotById.get(id);
    if (!lot) return [id, "—", "—", "—", "", "", "—", "—"];
    return [
      lot.lot_code,
      getLotTypeLabel(lot.lot_type),
      lot.product_name ?? "—",
      lot.quantity ?? "",
      lot.quantity_unit ?? "",
      lot.received_at
        ? new Date(lot.received_at).toLocaleDateString(lang === "en" ? "en-US" : "es")
        : lot.produced_at
        ? new Date(lot.produced_at).toLocaleDateString(lang === "en" ? "en-US" : "es")
        : "—",
      lot.destination ?? "—",
      lot.supplier_name ?? "—",
      lot.tlc_source ?? "—",
      lot.notes ?? "—",
    ];
  });

  const slug = rootLot.lot_code.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 24);
  const dateStr = new Date().toISOString().slice(0, 10);

  await downloadExcel({
    filename: `trazabilidad-${slug}-${dateStr}`,
    sheets: [
      {
        name: H.sheetChain,
        columns: [
          { header: H.direction, width: 24 },
          { header: H.lotCode, width: 18 },
          { header: H.lotType, width: 16 },
          { header: H.product, width: 28 },
          { header: H.quantity, width: 10 },
          { header: H.unit, width: 8 },
          { header: H.supplier, width: 22 },
          { header: H.tlcSource, width: 20 },
          { header: H.cteType, width: 20 },
          { header: H.eventDate, width: 14 },
          { header: H.location, width: 20 },
          { header: H.refDocType, width: 16 },
          { header: H.refDocNumber, width: 18 },
          { header: H.recipientName, width: 22 },
          { header: H.recipientLocation, width: 22 },
          { header: H.notes, width: 36 },
        ],
        rows: eventRows,
      },
      {
        name: H.sheetLots,
        columns: [
          { header: H.lotCode, width: 18 },
          { header: H.lotType, width: 16 },
          { header: H.product, width: 28 },
          { header: H.quantity, width: 10 },
          { header: H.unit, width: 8 },
          { header: lang === "en" ? "Date" : "Fecha", width: 14 },
          { header: lang === "en" ? "Destination" : "Destino", width: 24 },
          { header: H.supplier, width: 22 },
          { header: H.tlcSource, width: 20 },
          { header: H.notes, width: 36 },
        ],
        rows: lotSummaryRows,
      },
    ],
  });
}
