"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCcpLinkStatus } from "@/lib/haccp/ccp-linking";
import type { HaccpCcp, HaccpHazard, HaccpProcessStep, Nonconformity } from "@/types/database";

export interface CcpSummaryRow {
  ccp: HaccpCcp;
  productId: string;
  productName: string;
  step?: HaccpProcessStep;
  hazard?: HaccpHazard;
  templateName?: string | null;
  fieldLabel?: string | null;
  linkedNcs: Nonconformity[];
}

interface HaccpSummaryTableProps {
  rows: CcpSummaryRow[];
  showProduct?: boolean;
}

export function HaccpSummaryTable({
  rows,
  showProduct = false,
}: HaccpSummaryTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-light text-center py-8">
        No hay CCPs identificados. Completa el análisis de peligros primero.
      </p>
    );
  }

  return (
    <div className="bg-white rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showProduct && <TableHead>Producto</TableHead>}
            <TableHead>CCP</TableHead>
            <TableHead>Paso / Peligro</TableHead>
            <TableHead>Límite crítico</TableHead>
            <TableHead>Registro vinculado</TableHead>
            <TableHead>Última verificación</TableHead>
            <TableHead>NC vinculadas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ ccp, productId, productName, step, hazard, templateName, fieldLabel, linkedNcs }) => {
            const linkStatus = getCcpLinkStatus(ccp);
            const openNcs = linkedNcs.filter((nc) => nc.status !== "closed");

            return (
              <TableRow key={ccp.id}>
                {showProduct && (
                  <TableCell>
                    <Link
                      href={`/haccp/${productId}`}
                      className="text-sm text-forest hover:underline"
                    >
                      {productName}
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="success">{ccp.ccp_number}</Badge>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-ink">{step?.name ?? "—"}</p>
                  <p className="text-xs text-ink-faint line-clamp-1">
                    {hazard?.hazard_description ?? "—"}
                  </p>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {ccp.critical_limit}
                </TableCell>
                <TableCell>
                  {linkStatus === "linked" ? (
                    <div>
                      <Badge variant="success">Vinculado</Badge>
                      <p className="text-xs text-ink-faint mt-1">
                        {templateName}
                        {fieldLabel ? ` · ${fieldLabel}` : ""}
                      </p>
                    </div>
                  ) : (
                    <Badge variant="warning">Pendiente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-ink-light">
                  {ccp.last_verification_at
                    ? new Date(ccp.last_verification_at).toLocaleDateString("es")
                    : "—"}
                </TableCell>
                <TableCell>
                  {linkedNcs.length === 0 ? (
                    <span className="text-xs text-ink-faint">Ninguna</span>
                  ) : (
                    <div className="space-y-1">
                      {openNcs.length > 0 && (
                        <Badge variant="danger">{openNcs.length} abierta(s)</Badge>
                      )}
                      {linkedNcs.slice(0, 2).map((nc) => (
                        <Link
                          key={nc.id}
                          href={`/capa/${nc.id}`}
                          className="block text-xs text-forest hover:underline"
                        >
                          {nc.nc_number}
                        </Link>
                      ))}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
