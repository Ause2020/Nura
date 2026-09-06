"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAccessStatusLabel,
  resolveAccessStatus,
} from "@/lib/access/constants";
import type { AccessStatus } from "@/types/database";

export interface AdminOrganizationRow {
  id: string;
  name: string;
  country: string;
  access_status: AccessStatus;
  access_granted_at: string | null;
  access_expires_at: string | null;
  contract_notes: string | null;
  user_count: number;
  created_at: string;
}

interface OrganizationsTableProps {
  initialOrganizations: AdminOrganizationRow[];
}

function statusVariant(
  status: AccessStatus
): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "suspended" || status === "expired") return "danger";
  return "neutral";
}

export function OrganizationsTable({
  initialOrganizations,
}: OrganizationsTableProps) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function updateAccess(
    organizationId: string,
    accessStatus: "active" | "suspended" | "pending"
  ) {
    setUpdatingId(organizationId);
    const response = await fetch("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, accessStatus }),
    });

    if (response.ok) {
      setOrganizations((prev) =>
        prev.map((org) =>
          org.id === organizationId
            ? {
                ...org,
                access_status: accessStatus,
                access_granted_at:
                  accessStatus === "active"
                    ? new Date().toISOString()
                    : org.access_granted_at,
              }
            : org
        )
      );
    }
    setUpdatingId(null);
  }

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-ink-faint py-6 text-center">
        Aún no hay clientes provisionados
      </p>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent cursor-default">
            <TableHead>Empresa</TableHead>
            <TableHead>País</TableHead>
            <TableHead>Usuarios</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => {
            const resolved = resolveAccessStatus(
              org.access_status,
              org.access_expires_at
            );
            return (
              <TableRow key={org.id} className="cursor-default hover:bg-background">
                <TableCell>
                  <div>
                    <p className="font-medium text-ink">{org.name}</p>
                    {org.contract_notes && (
                      <p className="text-xs text-ink-faint truncate max-w-[180px]">
                        {org.contract_notes}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-ink-light">{org.country}</TableCell>
                <TableCell className="font-mono text-xs">{org.user_count}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(resolved)}>
                    {getAccessStatusLabel(resolved)}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-ink-light">
                  {org.access_expires_at
                    ? new Date(org.access_expires_at).toLocaleDateString("es")
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {org.access_status !== "active" && (
                      <Button
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        loading={updatingId === org.id}
                        onClick={() => updateAccess(org.id, "active")}
                      >
                        Activar
                      </Button>
                    )}
                    {org.access_status === "active" && (
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-xs text-danger"
                        loading={updatingId === org.id}
                        onClick={() => updateAccess(org.id, "suspended")}
                      >
                        Suspender
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
