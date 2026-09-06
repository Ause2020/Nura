"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TRACE_LOT_TYPE_OPTIONS } from "@/lib/traceability/constants";
import { createClient } from "@/lib/supabase/client";
import type { Supplier, TraceLot, TraceLotType } from "@/types/database";

interface CompositionRow {
  childLotId: string;
  quantity: string;
}

interface CreateLotFormProps {
  organizationId: string;
  userId: string;
  suppliers: Pick<Supplier, "id" | "name">[];
  rawLots: TraceLot[];
}

export function CreateLotForm({
  organizationId,
  userId,
  suppliers,
  rawLots,
}: CreateLotFormProps) {
  const router = useRouter();
  const [lotType, setLotType] = useState<TraceLotType>("raw_material");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [productName, setProductName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [producedAt, setProducedAt] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [lineArea, setLineArea] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [compositions, setCompositions] = useState<CompositionRow[]>([
    { childLotId: "", quantity: "" },
  ]);
  // FSMA 204 optional KDEs
  const [showKdes, setShowKdes] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [tlcSource, setTlcSource] = useState("");
  const [refDocType, setRefDocType] = useState("");
  const [refDocNumber, setRefDocNumber] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lotCode.trim()) {
      setError("El código de lote es requerido");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    const { data: lotData, error: lotError } = await supabase
      .from("trace_lots")
      .insert({
        organization_id: organizationId,
        lot_code: lotCode.trim().toUpperCase(),
        lot_type: lotType,
        product_name: productName.trim() || null,
        supplier_id: lotType === "raw_material" ? supplierId || null : null,
        received_at: lotType === "raw_material" ? receivedAt : null,
        produced_at: lotType !== "raw_material" ? producedAt : null,
        line_area: lotType !== "raw_material" ? lineArea.trim() || null : null,
        quantity: quantity ? Number(quantity) : null,
        quantity_unit: unit || null,
        destination:
          lotType === "finished" ? destination.trim() || null : null,
        notes: notes.trim() || null,
        created_by: userId,
        // FSMA 204 KDEs (optional)
        supplier_name: supplierName.trim() || null,
        tlc_source: tlcSource.trim() || null,
      })
      .select("id")
      .single();

    if (lotError || !lotData) {
      setLoading(false);
      setError(lotError?.message ?? "Error al crear lote");
      return;
    }

    const lotId = (lotData as { id: string }).id;
    const now = new Date().toISOString();

    if (lotType === "raw_material") {
      await supabase.from("trace_events").insert({
        organization_id: organizationId,
        event_type: "reception",
        lot_id: lotId,
        event_at: now,
        location: lineArea.trim() || null,
        quantity: quantity ? Number(quantity) : null,
        quantity_unit: unit || null,
        performed_by: userId,
        notes: supplierId
          ? `Recepción de proveedor`
          : "Recepción de materia prima",
        // FSMA 204 KDEs (optional)
        reference_doc_type: refDocType.trim() || null,
        reference_doc_number: refDocNumber.trim() || null,
      });
    }

    if (lotType === "finished" || lotType === "wip") {
      const validCompositions = compositions.filter((c) => c.childLotId);

      for (const row of validCompositions) {
        await supabase.from("trace_lot_compositions").insert({
          organization_id: organizationId,
          parent_lot_id: lotId,
          child_lot_id: row.childLotId,
          quantity_used: row.quantity ? Number(row.quantity) : null,
          quantity_unit: unit || null,
        });
      }

      await supabase.from("trace_events").insert({
        organization_id: organizationId,
        event_type: "transformation",
        lot_id: lotId,
        event_at: now,
        location: lineArea.trim() || null,
        quantity: quantity ? Number(quantity) : null,
        quantity_unit: unit || null,
        performed_by: userId,
        notes: `Producción — ${validCompositions.length} materia(s) consumida(s)`,
        // FSMA 204 KDEs (optional)
        reference_doc_type: refDocType.trim() || null,
        reference_doc_number: refDocNumber.trim() || null,
      });

      if (lotType === "finished" && destination.trim()) {
        await supabase.from("trace_events").insert({
          organization_id: organizationId,
          event_type: "shipment",
          lot_id: lotId,
          event_at: now,
          location: destination.trim(),
          quantity: quantity ? Number(quantity) : null,
          quantity_unit: unit || null,
          performed_by: userId,
          notes: "Despacho registrado al crear lote",
          // FSMA 204 KDEs (optional)
          reference_doc_type: refDocType.trim() || null,
          reference_doc_number: refDocNumber.trim() || null,
        });
      }
    }

    setLoading(false);
    router.push(`/trazabilidad/lotes/${lotId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div className="space-y-1">
        <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
          Tipo de lote
        </label>
        <select
          value={lotType}
          onChange={(e) => setLotType(e.target.value as TraceLotType)}
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          {TRACE_LOT_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Código de lote"
        value={lotCode}
        onChange={(e) => setLotCode(e.target.value)}
        placeholder="ej. MP-2026-0042"
        required
      />

      <Input
        label="Producto / descripción"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Cantidad"
          type="number"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          label="Unidad"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>

      {lotType === "raw_material" && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Proveedor
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Fecha de recepción"
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </>
      )}

      {(lotType === "finished" || lotType === "wip") && (
        <>
          <Input
            label="Fecha de producción"
            type="date"
            value={producedAt}
            onChange={(e) => setProducedAt(e.target.value)}
          />
          <Input
            label="Línea / área"
            value={lineArea}
            onChange={(e) => setLineArea(e.target.value)}
          />
          {lotType === "finished" && (
            <Input
              label="Destino (cliente / almacén)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          )}

          <div className="space-y-2 border border-border rounded-md p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-ink-faint">
              Materias consumidas
            </p>
            {compositions.map((row, index) => (
              <div key={index} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-ink-light">Lote MP</label>
                  <select
                    value={row.childLotId}
                    onChange={(e) =>
                      setCompositions((prev) =>
                        prev.map((r, i) =>
                          i === index
                            ? { ...r, childLotId: e.target.value }
                            : r
                        )
                      )
                    }
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                  >
                    <option value="">Seleccionar</option>
                    {rawLots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_code} — {l.product_name ?? "MP"}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Cant. usada"
                  type="number"
                  step="any"
                  value={row.quantity}
                  onChange={(e) =>
                    setCompositions((prev) =>
                      prev.map((r, i) =>
                        i === index ? { ...r, quantity: e.target.value } : r
                      )
                    )
                  }
                  className="w-28"
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="h-8 text-xs"
              onClick={() =>
                setCompositions((prev) => [
                  ...prev,
                  { childLotId: "", quantity: "" },
                ])
              }
            >
              + Materia
            </Button>
          </div>
        </>
      )}

      <Textarea
        label="Notas"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* ── FSMA 204 / EU — Datos opcionales de trazabilidad ── */}
      <div className="border border-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setShowKdes((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-50 text-left hover:bg-zinc-100 transition-colors"
        >
          <span className="text-xs font-mono uppercase tracking-wider text-ink-faint">
            Datos FSMA 204 / UE (opcional)
          </span>
          <span className="text-xs text-ink-faint">{showKdes ? "▲ Ocultar" : "▼ Ver"}</span>
        </button>
        {showKdes && (
          <div className="p-3 space-y-3">
            <p className="text-xs text-ink-faint">
              Estos campos son opcionales. Solo son necesarios si exportas a EE.UU. (FSMA 204) o
              necesitas documentación UE formal. El flujo normal funciona sin ellos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nombre proveedor (texto libre)"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Si no hay registro de proveedor"
              />
              <Input
                label="Fuente del código TLC"
                value={tlcSource}
                onChange={(e) => setTlcSource(e.target.value)}
                placeholder="Quién asignó el código"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                  Tipo doc. referencia
                </label>
                <select
                  value={refDocType}
                  onChange={(e) => setRefDocType(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  <option value="">Sin documento</option>
                  <option value="BOL">Bill of Lading (BOL)</option>
                  <option value="PO">Orden de compra (PO)</option>
                  <option value="Invoice">Factura / Invoice</option>
                  <option value="CMR">CMR (transporte UE)</option>
                  <option value="GRN">Nota de recepción (GRN)</option>
                  <option value="Other">Otro</option>
                </select>
              </div>
              <Input
                label="N° documento referencia"
                value={refDocNumber}
                onChange={(e) => setRefDocNumber(e.target.value)}
                placeholder="ej. BOL-2026-001"
                className="font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <Button type="submit" loading={loading}>
        Registrar lote
      </Button>
    </form>
  );
}
