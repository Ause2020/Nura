"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/team/constants";
import type { UserRole } from "@/types/database";

interface InvitationAcceptFormProps {
  token: string;
  organizationName: string;
  role: UserRole;
  invitedEmail: string;
  isLoggedIn: boolean;
  loggedInEmail?: string | null;
  emailMatches: boolean;
}

export function InvitationAcceptForm({
  token,
  organizationName,
  role,
  invitedEmail,
  isLoggedIn,
  loggedInEmail,
  emailMatches,
}: InvitationAcceptFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function accept(body: Record<string, string>) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });

    const data = await response.json();
    setLoading(false);

    if (response.status === 429) {
      setError("Demasiados intentos. Intenta de nuevo en unos minutos.");
      return false;
    }

    if (!response.ok) {
      setError(data.error ?? "No se pudo aceptar la invitación");
      return false;
    }

    return true;
  }

  async function handleNewUserSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") ?? "");
    const password = String(form.get("password") ?? "");

    const ok = await accept({ fullName, password });
    if (!ok) return;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: invitedEmail,
      password,
    });

    if (error) {
      router.push(`/login?redirect=/invitacion/${token}`);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (isLoggedIn && !emailMatches) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-light">
          Iniciaste sesión como <strong>{loggedInEmail}</strong>, pero la
          invitación es para <strong>{invitedEmail}</strong>.
        </p>
        <Link
          href={`/login?redirect=/invitacion/${token}`}
          className="text-sm text-forest underline"
        >
          Iniciar sesión con el email correcto
        </Link>
      </div>
    );
  }

  if (isLoggedIn && emailMatches) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-light">
          Unirte a <strong>{organizationName}</strong> como{" "}
          <strong>{ROLE_LABELS[role]}</strong>.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button
          loading={loading}
          onClick={async () => {
            const ok = await accept({});
            if (ok) {
              router.push("/dashboard");
              router.refresh();
            }
          }}
        >
          Aceptar invitación
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleNewUserSubmit} className="space-y-4">
      <p className="text-sm text-ink-light">
        Te invitaron a <strong>{organizationName}</strong> como{" "}
        <strong>{ROLE_LABELS[role]}</strong>.
      </p>
      <Input
        name="email"
        label="Email"
        type="email"
        value={invitedEmail}
        readOnly
        className="bg-background"
      />
      <Input name="fullName" label="Tu nombre completo" required />
      <Input
        name="password"
        label="Contraseña"
        type="password"
        required
        hint="Mínimo 8 caracteres"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">
        Crear cuenta y unirme
      </Button>
      <p className="text-xs text-ink-faint text-center">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={`/login?redirect=/invitacion/${token}`}
          className="text-forest underline"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
