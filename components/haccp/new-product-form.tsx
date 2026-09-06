"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { PACKAGING_TYPES, PRODUCT_CATEGORIES } from "@/lib/haccp/constants";
import { cn } from "@/lib/utils";

interface NewProductFormProps {
  organizationId: string;
}

export function NewProductForm({ organizationId }: NewProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [targetConsumer, setTargetConsumer] = useState("");
  const [shelfLifeDays, setShelfLifeDays] = useState("");
  const [storageConditions, setStorageConditions] = useState("");
  const [packagingType, setPackagingType] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors.name = "El nombre es requerido";
    if (!category) nextErrors.category = "Selecciona una categoría";
    if (description.length > 300)
      nextErrors.description = "Máximo 300 caracteres";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("haccp_products")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        category,
        description: description.trim() || null,
        intended_use: intendedUse.trim() || null,
        target_consumer: targetConsumer.trim() || null,
        shelf_life_days: shelfLifeDays ? parseInt(shelfLifeDays, 10) : null,
        storage_conditions: storageConditions.trim() || null,
        packaging_type: packagingType || null,
        status: "draft",
        plan_completion: 0,
      })
      .select("id")
      .single();

    if (error || !data) {
      setErrors({ form: "No pudimos crear el producto. Intenta de nuevo." });
      setLoading(false);
      return;
    }

    const product = data as { id: string };
    router.push(`/haccp/${product.id}`);
    router.refresh();
  }

  return (
    <>
      <ModuleHeader title="Nuevo producto" description="Registra un producto alimentario" />

      <div className="px-6 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre del producto"
              placeholder="Ej. Yogurt natural 200g"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              required
            />

            <div className="space-y-1">
              <label
                htmlFor="category"
                className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono"
              >
                Categoría<span className="text-danger ml-0.5">*</span>
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={cn(
                  "w-full h-9 px-3 text-sm text-ink bg-white border rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1",
                  errors.category ? "border-danger" : "border-border"
                )}
              >
                <option value="">Seleccionar</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-xs text-danger">{errors.category}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <Textarea
                label="Descripción"
                placeholder="Breve descripción del producto..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                error={errors.description}
                maxLength={300}
              />
              <p className="text-xs text-ink-faint text-right mt-1 font-mono">
                {description.length}/300
              </p>
            </div>

            <Input
              label="Uso previsto"
              placeholder="ej. Consumo directo, cocción previa requerida..."
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
            />

            <Input
              label="Consumidor objetivo"
              placeholder="ej. Población general, excluyendo grupos vulnerables"
              value={targetConsumer}
              onChange={(e) => setTargetConsumer(e.target.value)}
            />

            <Input
              label="Vida útil (días)"
              type="number"
              min={1}
              placeholder="30"
              value={shelfLifeDays}
              onChange={(e) => setShelfLifeDays(e.target.value)}
            />

            <Input
              label="Condiciones de almacenamiento"
              placeholder="ej. Refrigerado entre 2°C y 4°C"
              value={storageConditions}
              onChange={(e) => setStorageConditions(e.target.value)}
            />

            <div className="space-y-1">
              <label
                htmlFor="packaging"
                className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono"
              >
                Tipo de empaque
              </label>
              <select
                id="packaging"
                value={packagingType}
                onChange={(e) => setPackagingType(e.target.value)}
                className="w-full h-9 px-3 text-sm text-ink bg-white border border-border rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1"
              >
                <option value="">Seleccionar</option>
                {PACKAGING_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errors.form && (
            <p className="text-xs text-danger mt-4">{errors.form}</p>
          )}

          <div className="flex items-center gap-2 mt-6">
            <Link href="/haccp">
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" loading={loading}>
              Crear producto
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
