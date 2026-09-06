"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PasswordStrengthBar } from "@/components/auth/password-strength-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPasswordStrength } from "@/lib/auth/password-strength";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session) {
        settled = true;
        setReady(true);
      }
    });

    const timeout = window.setTimeout(() => {
      if (!settled) setExpired(true);
    }, 2500);

    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Mínimo 8 caracteres");
      return;
    }
    if (getPasswordStrength(password) === "weak") {
      setError("Usa mayúsculas, números o un símbolo para fortalecerla");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("No se pudo actualizar. Solicita un enlace nuevo.");
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    router.push("/login?info=password-updated");
    router.refresh();
  }

  if (expired && !ready) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-light bg-amber-light border border-amber/20 rounded-md px-3 py-3">
          El enlace expiró o no es válido. Solicita uno nuevo.
        </p>
        <Link
          href="/recuperar"
          className="block text-center text-xs text-forest hover:underline"
        >
          Recuperar contraseña
        </Link>
      </div>
    );
  }

  if (!ready) {
    return <p className="text-sm text-ink-light">Validando el enlace…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Nueva contraseña"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
      />
      <PasswordStrengthBar password={password} />
      <Input
        label="Confirmar contraseña"
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
        required
      />
      {error && (
        <p className="text-xs text-danger text-center" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        Guardar contraseña
      </Button>
    </form>
  );
}
