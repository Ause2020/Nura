"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeInternalRedirect } from "@/lib/auth/internal-redirect";
import { ensureUserProfile, repairStuckOnboarding } from "@/lib/auth/session";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError("");

    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "El email es requerido";
    else if (!isValidEmail(email)) errors.email = "Email inválido";
    if (!password) errors.password = "La contraseña es requerida";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    const loginRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (loginRes.status === 429) {
      setAuthError("Demasiados intentos. Intenta de nuevo en unos minutos.");
      setLoading(false);
      return;
    }

    if (!loginRes.ok) {
      setAuthError("Credenciales incorrectas");
      setLoading(false);
      return;
    }

    let profile = await ensureUserProfile();

    if (profile?.organization_id && !profile.onboarding_completed) {
      await repairStuckOnboarding();
      profile = await ensureUserProfile();
    }

    const ready = profile?.onboarding_completed === true;

    if (redirectTo && ready) {
      router.push(sanitizeInternalRedirect(redirectTo, "/dashboard"));
    } else if (ready) {
      router.push("/dashboard");
    } else {
      router.push("/onboarding");
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Email"
        type="email"
        placeholder="tu@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        autoComplete="email"
        required
      />
      <Input
        label="Contraseña"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        autoComplete="current-password"
        required
      />
      <p className="text-right -mt-2">
        <Link
          href="/recuperar"
          className="text-xs text-forest hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      {authError && (
        <p className="text-xs text-danger text-center" role="alert">
          {authError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        Iniciar sesión
      </Button>
    </form>
  );
}
