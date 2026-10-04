"use client";

import { useState, type FormEvent } from "react";
import { PasswordStrengthBar } from "@/components/auth/password-strength-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getPasswordStrength } from "@/lib/auth/password-strength";
import { createClient } from "@/lib/supabase/client";

interface ChangePasswordFormProps {
  email: string;
}

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Ingresa tu contraseña actual");
      return;
    }
    if (password.length < 8) {
      setError("La nueva contraseña debe tener mínimo 8 caracteres");
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
    if (password === currentPassword) {
      setError("La nueva contraseña debe ser distinta a la actual");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      setError("La contraseña actual no es correcta");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("No se pudo actualizar la contraseña. Intenta de nuevo.");
      return;
    }

    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    showToast("Contraseña actualizada", "success");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Contraseña actual"
        type="password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        autoComplete="current-password"
        required
      />
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
        label="Confirmar nueva contraseña"
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
        required
      />
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading}>
        Guardar contraseña
      </Button>
    </form>
  );
}
