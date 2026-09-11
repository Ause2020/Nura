"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("El email es requerido");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Email inválido");
      return;
    }

    setLoading(true);
    const resetRes = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    setLoading(false);
    if (resetRes.status === 429) {
      setError("Demasiados intentos. Intenta de nuevo en unos minutos.");
      return;
    }
    if (!resetRes.ok) {
      setError("No pudimos enviar el correo. Intenta de nuevo en unos minutos.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-light bg-sage-light border border-sage/20 rounded-md px-3 py-3">
          Si el email está registrado, te enviamos un enlace para crear una nueva
          contraseña. Revisa tu bandeja (y spam).
        </p>
        <Link
          href="/login"
          className="block text-center text-xs text-forest hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Email"
        type="email"
        placeholder="tu@empresa.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error}
        autoComplete="email"
        required
      />
      <Button type="submit" className="w-full" loading={loading}>
        Enviar enlace
      </Button>
      <p className="text-xs text-center">
        <Link href="/login" className="text-forest hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
