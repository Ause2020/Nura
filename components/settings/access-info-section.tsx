import {
  getAccessStatusLabel,
  resolveAccessStatus,
} from "@/lib/access/constants";
import type { Organization } from "@/types/database";

interface AccessInfoSectionProps {
  organization: Organization;
}

export function AccessInfoSection({ organization }: AccessInfoSectionProps) {
  const resolved = resolveAccessStatus(
    organization.access_status,
    organization.access_expires_at
  );

  return (
    <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink mb-1">Acceso a Nura</h2>
        <p className="text-xs text-ink-faint">
          El acceso se activa manualmente tras firmar contrato con Nura.
        </p>
      </div>

      <dl className="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-ink-faint uppercase tracking-wider font-mono">
            Estado
          </dt>
          <dd className="mt-1 font-medium text-ink">
            {getAccessStatusLabel(resolved)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint uppercase tracking-wider font-mono">
            Activado desde
          </dt>
          <dd className="mt-1 text-ink-light">
            {organization.access_granted_at
              ? new Date(organization.access_granted_at).toLocaleDateString("es")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint uppercase tracking-wider font-mono">
            Vence
          </dt>
          <dd className="mt-1 text-ink-light">
            {organization.access_expires_at
              ? new Date(organization.access_expires_at).toLocaleDateString("es")
              : "Sin fecha de vencimiento"}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-ink-faint bg-background border border-border rounded-md px-3 py-2">
        Para renovar, ampliar usuarios o cambiar tu plan, contacta a tu
        representante Nura. No hay portal de pago en línea.
      </p>
    </div>
  );
}
