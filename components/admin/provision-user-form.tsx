"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/types/database";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "quality_manager", label: "Jefe de calidad" },
  { value: "operator", label: "Operador" },
];

export interface AdminOrganizationOption {
  id: string;
  name: string;
  access_status: string;
}

interface ProvisionUserFormProps {
  organizations: AdminOrganizationOption[];
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

export function ProvisionUserForm({
  organizations,
  onCreated,
}: ProvisionUserFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [password, setPassword] = useState(generatePassword);

  const activeOrgs = organizations.filter((org) => org.access_status === "active");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = new FormData(e.currentTarget);

    const response = await fetch("/api/admin/provision-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: form.get("organizationId"),
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
        jobTitle: form.get("jobTitle"),
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Error al crear usuario");
      return;
    }

    setSuccess(`Usuario creado: ${data.email}`);
    setPassword(generatePassword());
    (e.target as HTMLFormElement).reset();
    onCreated();
  }

  if (activeOrgs.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Crea primero la empresa del cliente.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
          Empresa
        </label>
        <select
          name="organizationId"
          required
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          {activeOrgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Input name="fullName" label="Nombre completo" required />
        <Input name="email" label="Email" type="email" required />
        <Input name="jobTitle" label="Cargo" />
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Rol
          </label>
          <select
            name="role"
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            defaultValue="quality_manager"
          >
            {ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
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
          className="font-mono md:col-span-2"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-sage">{success}</p>}

      <Button type="submit" loading={loading}>
        Crear usuario
      </Button>
    </form>
  );
}
