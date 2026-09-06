"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDuration,
  MOCK_RECALL_GOAL_HOURS,
  MOCK_RECALL_STATUS_LABELS,
} from "@/lib/traceability/constants";
import { computeMockRecallReport } from "@/lib/traceability/graph";
import { createClient } from "@/lib/supabase/client";
import type {
  MockRecallSimulation,
  TraceLot,
  TraceLotComposition,
} from "@/types/database";

interface MockRecallRunnerProps {
  simulation: MockRecallSimulation;
  targetLots: TraceLot[];
  allLots: TraceLot[];
  compositions: TraceLotComposition[];
}

export function MockRecallRunner({
  simulation,
  targetLots,
  allLots,
  compositions,
}: MockRecallRunnerProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [completing, setCompleting] = useState(false);

  const startedMs = new Date(simulation.started_at).getTime();
  const goalSeconds = (simulation.goal_hours ?? MOCK_RECALL_GOAL_HOURS) * 3600;
  const isActive = simulation.status === "in_progress";

  useEffect(() => {
    if (!isActive) {
      if (simulation.elapsed_seconds != null) {
        setElapsed(simulation.elapsed_seconds);
      }
      return;
    }

    const tick = () => {
      setElapsed(Math.floor((Date.now() - startedMs) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, startedMs, simulation.elapsed_seconds]);

  async function handleComplete() {
    setCompleting(true);
    const supabase = createClient();
    const report = computeMockRecallReport(targetLots, allLots, compositions);
    const passed = elapsed <= goalSeconds;
    const now = new Date().toISOString();

    await supabase
      .from("mock_recall_simulations")
      .update({
        status: "completed",
        completed_at: now,
        elapsed_seconds: elapsed,
        passed_goal: passed,
        report,
      })
      .eq("id", simulation.id);

    setCompleting(false);
    router.refresh();
  }

  const report = simulation.report;
  const remaining = Math.max(goalSeconds - elapsed, 0);
  const progressPct = Math.min((elapsed / goalSeconds) * 100, 100);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-border rounded-md p-6 text-center space-y-4">
        <p className="text-xs font-mono uppercase tracking-wider text-ink-faint">
          Cronómetro simulacro
        </p>
        <p className="font-mono text-4xl font-semibold text-forest tabular-nums">
          {formatDuration(elapsed)}
        </p>
        {isActive && (
          <>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden max-w-xs mx-auto">
              <div
                className={`h-full rounded-full transition-all ${
                  elapsed > goalSeconds ? "bg-danger" : "bg-sage"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-ink-faint">
              Objetivo: {MOCK_RECALL_GOAL_HOURS}h (
              {remaining > 0
                ? `${formatDuration(remaining)} restantes`
                : "tiempo excedido"}
              )
            </p>
            <Button loading={completing} onClick={handleComplete}>
              Finalizar simulacro
            </Button>
          </>
        )}
        {!isActive && (
          <Badge variant={simulation.passed_goal ? "success" : "danger"}>
            {MOCK_RECALL_STATUS_LABELS[simulation.status]} ·{" "}
            {simulation.passed_goal ? "Cumple objetivo" : "Supera 4h"}
          </Badge>
        )}
      </div>

      <div className="bg-white border border-border rounded-md p-4 space-y-2">
        <h3 className="text-sm font-semibold text-ink">Lotes objetivo</h3>
        <div className="flex flex-wrap gap-2">
          {targetLots.map((lot) => (
            <Link key={lot.id} href={`/trazabilidad/lotes/${lot.id}`}>
              <Badge variant="neutral">{lot.lot_code}</Badge>
            </Link>
          ))}
        </div>
      </div>

      {report && (
        <div id="mock-recall-report" className="bg-white border border-border rounded-md p-4 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Reporte automático</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-ink-faint">Lotes encontrados</p>
              <p className="font-semibold">{report.lots_found.length}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Cantidad total</p>
              <p className="font-semibold font-mono">
                {report.total_quantity.toFixed(2)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-ink-faint">Destinos afectados</p>
              <p className="text-ink-light">
                {report.destinations.length > 0
                  ? report.destinations.join(", ")
                  : "Ninguno registrado"}
              </p>
            </div>
          </div>
          <ul className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono">
            {report.lots_found.map((row) => (
              <li key={row.lot_id} className="flex justify-between gap-2">
                <span>{row.lot_code}</span>
                <span className="text-ink-faint">
                  {row.destination ?? row.product_name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir reporte
          </Button>
        </div>
      )}
    </div>
  );
}
