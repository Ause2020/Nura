"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitBranch, ClipboardList, Plus, RotateCcw, Search } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { TraceabilityNavTabs } from "@/components/traceability/traceability-nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLotTypeLabel } from "@/lib/traceability/constants";
import type { MockRecallSimulation, TraceLot } from "@/types/database";

interface TraceabilityDashboardProps {
  lots: TraceLot[];
  recentSimulations: MockRecallSimulation[];
  initialSearch?: string;
}

export function TraceabilityDashboard({
  lots,
  recentSimulations,
  initialSearch = "",
}: TraceabilityDashboardProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const code = search.trim().toUpperCase();
    if (!code) return;

    const match = lots.find(
      (l) => l.lot_code.toUpperCase() === code
    );
    if (match) {
      router.push(`/trazabilidad/lotes/${match.id}`);
      return;
    }
    router.push(`/trazabilidad?q=${encodeURIComponent(code)}`);
  }

  const filteredLots = search.trim()
    ? lots.filter((l) =>
        l.lot_code.toUpperCase().includes(search.trim().toUpperCase())
      )
    : lots.slice(0, 20);

  return (
    <>
      <ModuleHeader
        title="Trazabilidad"
        description="Genealogía de lotes y simulacros de retiro"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/trazabilidad/ejercicio">
              <Button>
                <ClipboardList className="h-4 w-4" />
                Ejercicio de Trazabilidad
              </Button>
            </Link>
            <Link href="/trazabilidad/simulacro/nuevo">
              <Button variant="secondary">
                <RotateCcw className="h-4 w-4" />
                Simulacro
              </Button>
            </Link>
            <Link href="/trazabilidad/lotes/nuevo">
              <Button variant="secondary">
                <Plus className="h-4 w-4" />
                Nuevo lote
              </Button>
            </Link>
          </div>
        }
      />

      <TraceabilityNavTabs />

      <div className="px-6 py-4 space-y-6">
        <Link
          href="/trazabilidad/ejercicio"
          className="block bg-white border border-sage/30 rounded-md p-4 hover:border-sage/60 transition-colors"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-sage" />
                Ejercicio de Trazabilidad
              </p>
              <p className="text-xs text-ink-light mt-1 max-w-xl">
                Simulacro operativo BRCGS 3.9 / IFS Food v8 con cronómetro de 4 horas,
                8 etapas de cadena y carga de evidencias en planta.
              </p>
            </div>
            <span className="font-mono text-2xl font-semibold text-forest tabular-nums shrink-0">
              04:00:00
            </span>
          </div>
        </Link>

        <form
          onSubmit={handleSearch}
          className="bg-white border border-border rounded-md p-4 flex flex-col sm:flex-row gap-3"
        >
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código de lote..."
              className="pl-9"
            />
          </div>
          <Button type="submit">Rastrear lote</Button>
        </form>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-sage" />
            Lotes registrados
          </h2>
          <div className="bg-white border border-border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Destino</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-ink-light">
                      Sin lotes. Registra materias primas o productos terminados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLots.map((lot) => (
                    <TableRow
                      key={lot.id}
                      className="cursor-pointer hover:bg-background"
                      onClick={() =>
                        router.push(`/trazabilidad/lotes/${lot.id}`)
                      }
                    >
                      <TableCell className="font-mono text-forest">
                        {lot.lot_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" showDot={false}>
                          {getLotTypeLabel(lot.lot_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>{lot.product_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {lot.quantity != null
                          ? `${lot.quantity} ${lot.quantity_unit ?? ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-ink-light">
                        {lot.destination ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {recentSimulations.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                Simulacros recientes
              </h2>
              <Link
                href="/trazabilidad/simulacro"
                className="text-xs text-forest hover:underline"
              >
                Ver todos
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {recentSimulations.slice(0, 4).map((sim) => (
                <Link
                  key={sim.id}
                  href={`/trazabilidad/simulacro/${sim.id}`}
                  className="bg-white border border-border rounded-md p-3 hover:border-sage/40 transition-colors"
                >
                  <p className="font-mono text-sm text-forest">
                    {sim.simulation_number}
                  </p>
                  <p className="text-xs text-ink-faint mt-1">
                    {new Date(sim.started_at).toLocaleString("es")}
                  </p>
                  {sim.passed_goal != null && (
                    <Badge
                      variant={sim.passed_goal ? "success" : "danger"}
                      className="mt-2"
                    >
                      {sim.passed_goal ? "≤ 4h ✓" : "> 4h"}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
