import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  getAccessStatusLabel,
  resolveAccessStatus,
} from "@/lib/access/constants";
import type { AccessStatus } from "@/types/database";

export default async function AccesoPendientePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileData } = user
    ? await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const orgId = (profileData as { organization_id: string | null } | null)
    ?.organization_id;

  let status: AccessStatus = "pending";
  let orgName = "tu empresa";

  if (orgId) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name, access_status, access_expires_at")
      .eq("id", orgId)
      .maybeSingle();

    const org = orgData as {
      name: string;
      access_status: AccessStatus;
      access_expires_at: string | null;
    } | null;

    if (org) {
      orgName = org.name;
      status = resolveAccessStatus(org.access_status, org.access_expires_at);
    }
  }

  const messages: Record<AccessStatus, string> = {
    pending:
      "Tu cuenta todavía no tiene una empresa activa. El equipo de Nura crea el acceso al contratar.",
    suspended:
      "El acceso de tu organización está suspendido. Contacta a tu representante de Nura.",
    expired:
      "El periodo de acceso de tu organización ha vencido. Renueva tu contrato para continuar.",
    active: "",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-md border border-border p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-light mx-auto mb-4">
          <ShieldAlert className="h-6 w-6 text-amber" />
        </div>
        <h1 className="font-display text-lg font-semibold text-ink">
          Acceso no disponible
        </h1>
        <p className="text-xs text-ink-faint mt-1 mb-4">
          {orgName} · {getAccessStatusLabel(status)}
        </p>
        <p className="text-sm text-ink-light leading-relaxed">
          {messages[status]}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/login">
            <Button variant="secondary" className="w-full">
              Volver al login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
