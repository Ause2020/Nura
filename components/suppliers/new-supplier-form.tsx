"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_CRITICALITIES,
  SUPPLIER_STATUSES,
} from "@/lib/suppliers/constants";
import { suggestNextEvaluationDate } from "@/lib/suppliers/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  SupplierCategory,
  SupplierCriticality,
  SupplierStatus,
} from "@/types/database";

interface NewSupplierFormProps {
  organizationId: string;
}

export function NewSupplierForm({ organizationId }: NewSupplierFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [criticality, setCriticality] = useState<SupplierCriticality>("major");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const status = (form.get("status") as SupplierStatus) || "pending";
    const crit = (form.get("criticality") as SupplierCriticality) || "major";

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("suppliers")
      .insert({
        organization_id: organizationId,
        name: String(form.get("name")).trim(),
        category: form.get("category") as SupplierCategory,
        criticality: crit,
        contact_name: String(form.get("contact_name")).trim() || null,
        contact_email: String(form.get("contact_email")).trim() || null,
        contact_phone: String(form.get("contact_phone")).trim() || null,
        address: String(form.get("address")).trim() || null,
        country: String(form.get("country")).trim() || null,
        status,
        approval_stage: "request",
        re_evaluation_months:
          crit === "critical" ? 6 : crit === "major" ? 12 : 24,
        approval_date: String(form.get("approval_date")) || null,
        next_evaluation_date:
          String(form.get("next_evaluation_date")) ||
          suggestNextEvaluationDate(crit),
        notes: String(form.get("notes")).trim() || null,
      })
      .select("id")
      .single();

    setLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al crear proveedor");
      return;
    }

    router.push(`/proveedores/${(data as { id: string }).id}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader
        title="Nuevo proveedor"
        description="Registro y homologación"
        actions={
          <Link href="/proveedores">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="px-6 py-4 max-w-2xl space-y-4"
      >
        {criticality === "critical" && (
          <p className="text-xs text-ink-light bg-sage-light border border-sage/20 rounded-md px-3 py-2">
            Los proveedores críticos requieren aprobación formal y evaluación
            semestral según ISO 22000.
          </p>
        )}

        <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
          <Input name="name" label="Nombre del proveedor" required />

          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Categoría
              </label>
              <select
                name="category"
                required
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {SUPPLIER_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Criticidad
              </label>
              <select
                name="criticality"
                value={criticality}
                onChange={(e) =>
                  setCriticality(e.target.value as SupplierCriticality)
                }
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {SUPPLIER_CRITICALITIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Input name="contact_name" label="Contacto" />
            <Input name="contact_email" label="Email" type="email" />
            <Input name="contact_phone" label="Teléfono" />
            <Input name="country" label="País" />
          </div>

          <Input name="address" label="Dirección" />

          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Estado
              </label>
              <select
                name="status"
                defaultValue="pending"
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {SUPPLIER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <Input name="approval_date" label="Fecha aprobación" type="date" />
            <Input
              name="next_evaluation_date"
              label="Próxima evaluación"
              type="date"
              defaultValue={suggestNextEvaluationDate(criticality)}
            />
          </div>

          <Textarea name="notes" label="Notas" />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" loading={loading}>
          Crear proveedor
        </Button>
      </form>
    </>
  );
}
