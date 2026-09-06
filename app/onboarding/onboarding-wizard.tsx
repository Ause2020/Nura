"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Stepper } from "@/components/onboarding/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  completeOnboarding,
} from "@/lib/auth/session";
import {
  CERTIFICATIONS,
  COUNTRIES,
  EMPLOYEES_RANGES,
  INDUSTRIES,
  getCertificationLabels,
  getCountryLabel,
  getEmployeesLabel,
  getIndustryLabel,
} from "@/lib/onboarding/constants";
import { cn } from "@/lib/utils";
import type { EmployeesRange, Industry } from "@/types/database";

const STEPS = [
  { label: "Tu empresa" },
  { label: "Normas" },
  { label: "Listo" },
];

export function OnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState<Industry | "">("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [employeesRange, setEmployeesRange] = useState<EmployeesRange | "">("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [noneSelected, setNoneSelected] = useState(false);

  function toggleCertification(value: string) {
    setNoneSelected(false);
    setCertifications((prev) =>
      prev.includes(value)
        ? prev.filter((c) => c !== value)
        : [...prev, value]
    );
  }

  function toggleNone() {
    if (noneSelected) {
      setNoneSelected(false);
    } else {
      setNoneSelected(true);
      setCertifications([]);
    }
  }

  function validateStep1(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!companyName.trim()) nextErrors.companyName = "El nombre es requerido";
    if (!industry) nextErrors.industry = "Selecciona una industria";
    if (!country) nextErrors.country = "Selecciona un país";
    if (!employeesRange) nextErrors.employeesRange = "Selecciona el tamaño";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(s + 1, 3));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleComplete() {
    setLoading(true);

    const { organizationId, error: onboardingError } = await completeOnboarding({
      name: companyName.trim(),
      industry: industry as Industry,
      country,
      city: city.trim() || null,
      employees_range: employeesRange as EmployeesRange,
      certifications: noneSelected ? [] : certifications,
    });

    if (onboardingError || !organizationId) {
      showToast(
        onboardingError ??
          "No pudimos guardar tu empresa. Contacta soporte si el problema continúa.",
        "error"
      );
      setLoading(false);
      return;
    }

    showToast("¡Bienvenido a Nura! Tu empresa está lista.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <Stepper currentStep={step} steps={STEPS} />

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-ink tracking-tight">
              Tu empresa
            </h2>
            <p className="text-xs text-ink-faint mt-0.5">
              Cuéntanos sobre tu operación para personalizar Nura
            </p>
          </div>

          <Input
            label="Nombre de la empresa"
            placeholder="Ej. Alimentos del Valle S.A."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            error={errors.companyName}
            required
          />

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Industria<span className="text-danger ml-0.5">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRIES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIndustry(value)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-md border text-left text-sm transition-colors duration-150",
                    industry === value
                      ? "border-forest bg-sage-light text-forest"
                      : "border-border bg-white text-ink-light hover:bg-background"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </div>
            {errors.industry && (
              <p className="text-xs text-danger">{errors.industry}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="country"
                className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono"
              >
                País<span className="text-danger ml-0.5">*</span>
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={cn(
                  "w-full h-9 px-3 text-sm text-ink bg-white border rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1",
                  errors.country ? "border-danger" : "border-border"
                )}
              >
                <option value="">Seleccionar país</option>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {errors.country && (
                <p className="text-xs text-danger">{errors.country}</p>
              )}
            </div>
            <Input
              label="Ciudad"
              placeholder="Ej. Bogotá"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Tamaño de empresa<span className="text-danger ml-0.5">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EMPLOYEES_RANGES.map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-md border cursor-pointer text-sm transition-colors duration-150",
                    employeesRange === value
                      ? "border-forest bg-sage-light text-forest"
                      : "border-border bg-white hover:bg-background"
                  )}
                >
                  <input
                    type="radio"
                    name="employees"
                    value={value}
                    checked={employeesRange === value}
                    onChange={() => setEmployeesRange(value)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      "h-3.5 w-3.5 rounded-full border-2 shrink-0",
                      employeesRange === value
                        ? "border-forest bg-forest"
                        : "border-ink-faint"
                    )}
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.employeesRange && (
              <p className="text-xs text-danger">{errors.employeesRange}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleNext}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-ink tracking-tight">
              Normas y certificaciones
            </h2>
            <p className="text-xs text-ink-faint mt-0.5">
              No te preocupes, puedes cambiar esto después
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {CERTIFICATIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleCertification(value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors duration-150",
                  certifications.includes(value)
                    ? "bg-sage-light text-forest border-sage/30 ring-1 ring-inset ring-sage/30"
                    : "bg-white text-ink-light border-border hover:bg-background"
                )}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleNone}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors duration-150",
                noneSelected
                  ? "bg-zinc-100 text-ink border-ink-faint"
                  : "bg-white text-ink-light border-border hover:bg-background"
              )}
            >
              Ninguna aún
            </button>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={handleBack}>
              Atrás
            </Button>
            <Button type="button" onClick={handleNext}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center py-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sage-light mb-4">
              <CheckCircle2 className="h-7 w-7 text-sage" />
            </div>
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">
              ¡Listo para empezar!
            </h2>
            <p className="text-xs text-ink-faint mt-1">
              Revisa tu configuración antes de entrar
            </p>
          </div>

          <div className="bg-white rounded-md border border-border divide-y divide-border">
            <SummaryRow label="Empresa" value={companyName} />
            <SummaryRow
              label="Industria"
              value={industry ? getIndustryLabel(industry) : "—"}
            />
            <SummaryRow
              label="Ubicación"
              value={
                country
                  ? `${getCountryLabel(country)}${city ? `, ${city}` : ""}`
                  : "—"
              }
            />
            <SummaryRow
              label="Tamaño"
              value={
                employeesRange ? getEmployeesLabel(employeesRange) : "—"
              }
            />
            <SummaryRow
              label="Certificaciones"
              value={
                noneSelected
                  ? "Ninguna aún"
                  : getCertificationLabels(certifications)
              }
            />
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={handleBack}>
              Atrás
            </Button>
            <Button
              type="button"
              onClick={handleComplete}
              loading={loading}
            >
              Ir a mi sistema
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3">
      <span className="text-xs text-ink-faint uppercase tracking-wider font-mono shrink-0">
        {label}
      </span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  );
}
