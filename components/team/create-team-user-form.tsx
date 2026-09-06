"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { INVITABLE_ROLES, ROLE_LABELS } from "@/lib/team/constants";

interface CreateTeamUserFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function CreateTeamUserForm({
  open,
  onClose,
  onCreated,
}: CreateTeamUserFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [password, setPassword] = useState(generatePassword);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = new FormData(e.currentTarget);

    const response = await fetch("/api/team/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Error al crear usuario");
      return;
    }

    setSuccess(`Usuario creado: ${data.user?.email ?? form.get("email")}`);
    setPassword(generatePassword());
    (e.target as HTMLFormElement).reset();
    onCreated();
  }

  function handleClose() {
    setError("");
    setSuccess("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Crear credenciales">
      <p className="text-xs text-ink-faint mb-4">
        Crea el usuario directamente y entrega email y contraseña en persona.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Input name="fullName" label="Nombre completo" required />
          <Input name="email" label="Email" type="email" required />
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Rol
            </label>
            <select
              name="role"
              defaultValue="operator"
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <Input
            name="password"
            label="Contraseña inicial"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="font-mono"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {success && <p className="text-xs text-sage">{success}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cerrar
          </Button>
          <Button type="submit" loading={loading}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}
