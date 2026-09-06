"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { generateSimulationNumber } from "@/lib/traceability/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TraceLot } from "@/types/database";

interface StartMockRecallFormProps {
  lots: TraceLot[];
  members: Pick<Profile, "id" | "full_name">[];
  organizationId: string;
  userId: string;
}

export function StartMockRecallForm({
  lots,
  members,
  organizationId,
  userId,
}: StartMockRecallFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [responsibleId, setResponsibleId] = useState(userId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleLot(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleStart() {
    if (selected.length === 0) {
      setError("Selecciona al menos un lote objetivo");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();
    const simulationNumber = await generateSimulationNumber(
      supabase,
      organizationId
    );

    const { data, error: insertError } = await supabase
      .from("mock_recall_simulations")
      .insert({
        organization_id: organizationId,
        simulation_number: simulationNumber,
        started_by: userId,
        responsible_id: responsibleId,
        status: "in_progress",
        goal_hours: 4,
      })
      .select("id")
      .single();

    if (insertError || !data) {
      setLoading(false);
      setError(insertError?.message ?? "Error al iniciar");
      return;
    }

    const simId = (data as { id: string }).id;

    await supabase.from("mock_recall_simulation_lots").insert(
      selected.map((lotId) => ({
        simulation_id: simId,
        lot_id: lotId,
        organization_id: organizationId,
      }))
    );

    setLoading(false);
    router.push(`/trazabilidad/simulacro/${simId}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title="Iniciar simulacro de retiro"
        description="Selecciona lote(s) objetivo — objetivo: completar en menos de 4 horas"
      />

      <div className="px-6 py-4 max-w-xl space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Responsable
          </label>
          <select
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-border rounded-md divide-y divide-border max-h-64 overflow-y-auto">
          {lots.length === 0 ? (
            <p className="p-4 text-sm text-ink-light">
              No hay lotes.{" "}
              <Link href="/trazabilidad/lotes/nuevo" className="text-forest">
                Registrar lote
              </Link>
            </p>
          ) : (
            lots.map((lot) => (
              <label
                key={lot.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(lot.id)}
                  onChange={() => toggleLot(lot.id)}
                  className="rounded border-border"
                />
                <span className="font-mono text-sm text-forest">
                  {lot.lot_code}
                </span>
                <span className="text-xs text-ink-faint truncate">
                  {lot.product_name ?? ""}
                </span>
              </label>
            ))
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2">
          <Link href="/trazabilidad/simulacro">
            <Button variant="secondary">Cancelar</Button>
          </Link>
          <Button loading={loading} onClick={handleStart}>
            Iniciar cronómetro
          </Button>
        </div>
      </div>
    </>
  );
}
