"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PasswordStrengthBar } from "@/components/auth/password-strength-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function RegisterForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");

    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "El nombre es requerido";
    if (!email.trim()) errors.email = "El email es requerido";
    else if (!isValidEmail(email)) errors.email = "Email inválido";
    if (!password) errors.password = "La contraseña es requerida";
    else if (password.length < 8)
      errors.password = "Mínimo 8 caracteres";
    if (!termsAccepted) errors.terms = "Debes aceptar los términos de servicio";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          job_title: jobTitle.trim() || null,
        },
      },
    });

    if (error) {
      setSubmitError(
        error.message.includes("already registered")
          ? "Este email ya está registrado"
          : "No pudimos crear tu cuenta. Intenta de nuevo."
      );
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else {
      setSubmitError(
        "Revisa tu email para confirmar tu cuenta antes de continuar."
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Nombre completo"
        placeholder="María García"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={fieldErrors.fullName}
        autoComplete="name"
        required
      />
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
      <div className="space-y-1">
        <Input
          label="Contraseña"
          type="password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          autoComplete="new-password"
          required
        />
        <PasswordStrengthBar password={password} />
      </div>
      <Input
        label="Cargo"
        placeholder="Jefe de Calidad"
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        autoComplete="organization-title"
      />

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border text-forest focus-visible:ring-2 focus-visible:ring-sage"
        />
        <span className="text-xs text-ink-light">
          Acepto los{" "}
          <span className="text-sage underline">términos de servicio</span> y la
          política de privacidad
        </span>
      </label>
      {fieldErrors.terms && (
        <p className="text-xs text-danger">{fieldErrors.terms}</p>
      )}

      {submitError && (
        <p className="text-xs text-danger text-center" role="alert">
          {submitError}
        </p>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        Crear cuenta
      </Button>
    </form>
  );
}
