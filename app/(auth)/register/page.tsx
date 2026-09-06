import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm bg-white rounded-md border border-border p-6 shadow-sm text-center">
        <h1 className="font-display text-xl font-semibold text-forest">
          Acceso por invitación
        </h1>
        <p className="text-sm text-ink-light mt-3 leading-relaxed">
          Nura se activa manualmente después de firmar contrato. Tu representante
          te entregará email y contraseña de acceso.
        </p>
        <Link href="/login" className="block mt-6">
          <Button className="w-full">Ir a iniciar sesión</Button>
        </Link>
      </div>
    </div>
  );
}
