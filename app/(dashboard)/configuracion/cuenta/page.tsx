import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function CuentaSettingsPage() {
  const user = await getSessionUser();
  if (!user?.email) redirect("/login");

  return (
    <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink mb-1">Tu contraseña</h2>
        <p className="text-xs text-ink-faint">
          Nura te entrega una contraseña inicial al contratar. Puedes cambiarla
          cuando quieras.
        </p>
      </div>
      <p className="text-xs text-ink-light">
        Cuenta: <span className="font-medium text-ink">{user.email}</span>
      </p>
      <ChangePasswordForm email={user.email} />
    </div>
  );
}
