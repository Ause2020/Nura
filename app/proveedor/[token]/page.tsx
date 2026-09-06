import Link from "next/link";
import { SupplierPortalForm } from "@/components/suppliers/supplier-portal-form";
import {
  getPortalByToken,
  isPortalTokenValid,
} from "@/lib/suppliers/portal";

export default async function ProveedorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await getPortalByToken(token);

  if (!context || !isPortalTokenValid(context.token)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md bg-white border border-border rounded-md p-6 text-center space-y-4">
          <h1 className="font-display text-lg font-semibold text-ink">
            Enlace no disponible
          </h1>
          <p className="text-sm text-ink-faint">
            El enlace expiró o no es válido. Solicita uno nuevo a tu contacto
            en calidad.
          </p>
          <Link href="/login" className="text-sm text-forest underline">
            Ir a Nura
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="mb-6 text-center">
          <p className="text-xs text-ink-faint uppercase tracking-wider font-mono">
            Nura · Proveedores
          </p>
        </div>
        <div className="bg-white border border-border rounded-md p-6 shadow-sm">
          <SupplierPortalForm
            token={token}
            supplier={context.supplier}
            organizationName={context.organizationName}
          />
        </div>
      </div>
    </div>
  );
}
