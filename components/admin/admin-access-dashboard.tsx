"use client";

import { useCallback, useState } from "react";
import { ModuleHeader } from "@/components/layout/header";
import {
  OrganizationsTable,
  type AdminOrganizationRow,
} from "@/components/admin/organizations-table";
import { ProvisionClientForm } from "@/components/admin/provision-client-form";
import { ProvisionUserForm } from "@/components/admin/provision-user-form";

interface AdminAccessDashboardProps {
  initialOrganizations: AdminOrganizationRow[];
}

export function AdminAccessDashboard({
  initialOrganizations,
}: AdminAccessDashboardProps) {
  const [organizations, setOrganizations] =
    useState(initialOrganizations);

  const refreshOrganizations = useCallback(async () => {
    const response = await fetch("/api/admin/organizations");
    if (!response.ok) return;
    const data = await response.json();
    setOrganizations(data.organizations ?? []);
  }, []);

  return (
    <>
      <ModuleHeader
        title="Acceso manual"
        description="Provisiona credenciales tras firmar contrato con el cliente"
      />

      <div className="px-6 py-4 space-y-8">
        <section className="bg-white border border-border rounded-md p-4 md:p-6">
          <h2 className="text-sm font-semibold text-ink tracking-tight mb-1">
            Nuevo cliente
          </h2>
          <p className="text-xs text-ink-faint mb-4">
            Crea la empresa, el usuario principal y las credenciales de acceso.
            Entrega email y contraseña al cliente en persona.
          </p>
          <ProvisionClientForm onCreated={refreshOrganizations} />
        </section>

        <section className="bg-white border border-border rounded-md p-4 md:p-6">
          <h2 className="text-sm font-semibold text-ink tracking-tight mb-1">
            Usuario adicional
          </h2>
          <p className="text-xs text-ink-faint mb-4">
            Agrega credenciales para otro miembro de una empresa existente.
          </p>
          <ProvisionUserForm
            organizations={organizations}
            onCreated={refreshOrganizations}
          />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink tracking-tight mb-3">
            Clientes provisionados
          </h2>
          <OrganizationsTable initialOrganizations={organizations} />
        </section>
      </div>
    </>
  );
}
