import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { LoginForm } from "./login-form";

function InfoNotice({ info }: { info?: string }) {
  if (info === "manual-access") {
    return (
      <p className="text-xs text-ink-light bg-sage-light border border-sage/20 rounded-md px-3 py-2 mb-4">
        Al contratar Nura te entregamos usuario y contraseña para el primer
        acceso. Si ya las tienes, inicia sesión abajo.
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string }>;
}) {
  const query = await searchParams;
  return (
    <AuthSplitLayout
      title="Iniciar sesión"
      subtitle="Usa el usuario y la contraseña que te entregó Nura"
      footer={
        <p className="text-xs text-ink-faint text-center mt-6">
          ¿Aún no tienes acceso?{" "}
          <span className="text-ink-light">
            Tu representante Nura crea la empresa y las credenciales al
            contratar.
          </span>
        </p>
      }
    >
      <InfoNotice info={query.info} />
      <Suspense fallback={<div className="h-40 animate-pulse bg-zinc-100 rounded-md" />}>
        <LoginForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
