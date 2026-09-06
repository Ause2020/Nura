"use client";

import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOC_TYPES } from "@/lib/suppliers/constants";
import type { Supplier, SupplierDocType } from "@/types/database";

interface SupplierPortalFormProps {
  token: string;
  supplier: Supplier;
  organizationName: string;
}

export function SupplierPortalForm({
  token,
  supplier,
  organizationName,
}: SupplierPortalFormProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) {
      setLoading(false);
      setError("Selecciona un archivo PDF o imagen");
      return;
    }

    const uploadData = new FormData();
    uploadData.set("token", token);
    uploadData.set("doc_type", String(form.get("doc_type")));
    uploadData.set("doc_name", String(form.get("doc_name")).trim());
    uploadData.set("expiry_date", String(form.get("expiry_date")));
    uploadData.set("file", file);

    try {
      const res = await fetch("/api/proveedor/upload", {
        method: "POST",
        body: uploadData,
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el documento");
        return;
      }
      setSuccess(true);
      e.currentTarget.reset();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="font-display text-lg font-semibold text-ink">
          Portal de documentación
        </p>
        <p className="text-sm text-ink-faint mt-1">
          {organizationName} solicita documentación de{" "}
          <span className="text-ink font-medium">{supplier.name}</span>.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
          Tipo de documento
        </label>
        <select
          name="doc_type"
          required
          className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          {DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <Input name="doc_name" label="Nombre del documento" required />
      <Input name="expiry_date" label="Fecha de vencimiento" type="date" />

      <div className="space-y-1">
        <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
          Archivo (PDF o imagen, máx. 10 MB)
        </label>
        <input
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          className="w-full text-sm"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {success && (
        <p className="text-xs text-sage">
          Documento enviado. Tu equipo de calidad lo revisará pronto.
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        <Upload className="h-4 w-4" />
        {loading ? "Enviando…" : "Enviar documento"}
      </Button>
    </form>
  );
}
