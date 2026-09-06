"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { Industry, UserRole } from "@/types/database";

const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: "carnico", label: "Cárnico" },
  { value: "lacteo", label: "Lácteo" },
  { value: "panaderia", label: "Panadería" },
  { value: "conservas", label: "Conservas" },
  { value: "foodservice", label: "Food service" },
  { value: "otro", label: "Otro" },
];

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "quality_manager", label: "Jefe de calidad" },
  { value: "operator", label: "Operador" },
];

interface ProvisionClientFormProps {
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

export function ProvisionClientForm({ onCreated }: ProvisionClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState(generatePassword());

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = new FormData(e.currentTarget);

    const response = await fetch("/api/admin/provision-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: form.get("organizationName"),
        industry: form.get("industry"),
        country: form.get("country"),
        city: form.get("city"),
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
        jobTitle: form.get("jobTitle"),
        contractNotes: form.get("contractNotes"),
        accessExpiresAt: form.get("accessExpiresAt") || null,
        skipOnboarding: true,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Error al crear cliente");
      return;
    }

    setSuccess(
      `Cliente creado: ${data.organizationName} · ${data.email} · contraseña entregada al cliente`
    );
    setGeneratedPassword(generatePassword());
    (e.target as HTMLFormElement).reset();
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Input
          name="organizationName"
          label="Empresa"
          placeholder="Nombre de la organización"
          required
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Industria
          </label>
          <select
            name="industry"
            required
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            defaultValue="carnico"
          >
            {INDUSTRIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <Input name="country" label="País" placeholder="Colombia" required />
        <Input name="city" label="Ciudad" placeholder="Opcional" />
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono mb-3">
          Credenciales del contacto principal
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <Input name="fullName" label="Nombre completo" required />
          <Input name="email" label="Email" type="email" required />
          <Input name="jobTitle" label="Cargo" placeholder="Jefe de calidad" />
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Rol
            </label>
            <select
              name="role"
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              defaultValue="admin"
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
            defaultValue={generatedPassword}
            required
            className="font-mono"
          />
          <Input
            name="accessExpiresAt"
            label="Acceso válido hasta"
            type="date"
          />
        </div>
      </div>

      <Textarea
        name="contractNotes"
        label="Notas del contrato"
        placeholder="Referencia del contrato firmado, plan contratado, observaciones..."
      />

      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-sage">{success}</p>}

      <Button type="submit" loading={loading}>
        Crear cliente y credenciales
      </Button>
    </form>
  );
}
