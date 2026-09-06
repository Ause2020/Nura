"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  CERTIFICATIONS,
  COUNTRIES,
  EMPLOYEES_RANGES,
  INDUSTRIES,
} from "@/lib/onboarding/constants";
import { LOGO_ACCEPT, LOGO_MAX_BYTES } from "@/lib/settings/constants";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { EmployeesRange, Industry, Organization } from "@/types/database";

interface CompanySettingsFormProps {
  organization: Organization;
}

export function CompanySettingsForm({ organization }: CompanySettingsFormProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(organization.logo_url);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(organization.name);
  const [industry, setIndustry] = useState<Industry>(organization.industry);
  const [country, setCountry] = useState(organization.country);
  const [city, setCity] = useState(organization.city ?? "");
  const [employeesRange, setEmployeesRange] = useState<EmployeesRange | "">(
    organization.employees_range ?? ""
  );
  const [certifications, setCertifications] = useState<string[]>(
    organization.certifications ?? []
  );

  async function saveOrganization(patch: Record<string, unknown>) {
    const response = await fetch("/api/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Error al guardar");
    return data.organization as Organization;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveOrganization({
        name,
        industry,
        country,
        city,
        employees_range: employeesRange || null,
        certifications,
      });
      showToast("Datos de empresa actualizados");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  const handleLogoUpload = useCallback(
    async (file: File) => {
      if (file.size > LOGO_MAX_BYTES) {
        showToast("El logo debe pesar menos de 2 MB", "error");
        return;
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${organization.id}/logo-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(path, file, { upsert: true });

        if (uploadError) throw new Error(uploadError.message);

        const { data } = supabase.storage.from("logos").getPublicUrl(path);
        await saveOrganization({ logo_url: data.publicUrl });
        setLogoUrl(data.publicUrl);
        showToast("Logo actualizado");
        window.location.reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al subir logo", "error");
      } finally {
        setUploading(false);
      }
    },
    [organization.id, showToast]
  );

  function toggleCertification(value: string) {
    setCertifications((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="bg-white border border-border rounded-md p-4 md:p-6">
        <h2 className="text-sm font-semibold text-ink mb-1">Logo</h2>
        <p className="text-xs text-ink-faint mb-4">
          Aparece en el sidebar y en informes exportados. Máximo 2 MB.
        </p>

        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo"
                width={64}
                height={64}
                className="h-full w-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xs text-ink-faint font-mono">Sin logo</span>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogoUpload(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Subir logo
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Datos generales</h2>

        <Input
          label="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Industria
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as Industry)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {INDUSTRIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              País
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {COUNTRIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Ciudad"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />

          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Tamaño
            </label>
            <select
              value={employeesRange}
              onChange={(e) =>
                setEmployeesRange(e.target.value as EmployeesRange | "")
              }
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              <option value="">Seleccionar</option>
              {EMPLOYEES_RANGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white border border-border rounded-md p-4 md:p-6">
        <h2 className="text-sm font-semibold text-ink mb-1">Certificaciones</h2>
        <p className="text-xs text-ink-faint mb-4">
          Normas que aplican a tu operación.
        </p>
        <div className="flex flex-wrap gap-2">
          {CERTIFICATIONS.map((cert) => (
            <button
              key={cert.value}
              type="button"
              onClick={() => toggleCertification(cert.value)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border transition-colors duration-150",
                certifications.includes(cert.value)
                  ? "bg-sage-light border-sage text-forest"
                  : "border-border text-ink-light hover:bg-background"
              )}
            >
              {cert.label}
            </button>
          ))}
        </div>
      </section>

      <Button type="submit" loading={saving}>
        Guardar cambios
      </Button>
    </form>
  );
}
