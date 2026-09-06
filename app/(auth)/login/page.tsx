import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { LoginForm } from "./login-form";

function InfoNotice({ info }: { info?: string }) {
  if (info === "manual-access") {
    return (
      <p className="text-xs text-ink-light bg-sage-light border border-sage/20 rounded-md px-3 py-2 mb-4">
        El acceso a Nura se activa manualmente tras firmar contrato. Si ya tienes
        credenciales, inicia sesión abajo.
      </p>
    );
  }
  if (info === "password-updated") {
    return (
      <p className="text-xs text-forest bg-sage-light border border-sage/20 rounded-md px-3 py-2 mb-4">
        Contraseña actualizada. Inicia sesión con la nueva.
      </p>
    );
  }
  if (info === "reset-expired") {
    return (
      <p className="text-xs text-ink-light bg-amber-light border border-amber/20 rounded-md px-3 py-2 mb-4">
        El enlace de recuperación expiró. Solicita uno nuevo.
      </p>
    );
  }
  return null;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { info?: string };
}) {
  return (
    <AuthSplitLayout
      title="Iniciar sesión"
      subtitle="Accede con las credenciales entregadas por Nura"
      footer={
        <p className="text-xs text-ink-faint text-center mt-6">
          ¿Necesitas acceso?{" "}
          <span className="text-ink-light">
            Contacta a tu representante Nura tras firmar contrato.
          </span>
        </p>
      }
    >
      <InfoNotice info={searchParams?.info} />
      <Suspense fallback={<div className="h-40 animate-pulse bg-zinc-100 rounded-md" />}>
        <LoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
