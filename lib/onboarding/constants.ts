import type { Industry, EmployeesRange } from "@/types/database";
import type { LucideIcon } from "lucide-react";
import {
  Beef,
  Croissant,
  Factory,
  Package,
  UtensilsCrossed,
  Milk,
} from "lucide-react";

export interface IndustryOption {
  value: Industry;
  label: string;
  icon: LucideIcon;
}

export const INDUSTRIES: IndustryOption[] = [
  { value: "carnico", label: "Cárnico", icon: Beef },
  { value: "lacteo", label: "Lácteo", icon: Milk },
  { value: "panaderia", label: "Panadería", icon: Croissant },
  { value: "conservas", label: "Conservas", icon: Package },
  { value: "foodservice", label: "Food service", icon: UtensilsCrossed },
  { value: "otro", label: "Otro", icon: Factory },
];

export const COUNTRIES = [
  { value: "AR", label: "Argentina" },
  { value: "BO", label: "Bolivia" },
  { value: "BR", label: "Brasil" },
  { value: "CL", label: "Chile" },
  { value: "CO", label: "Colombia" },
  { value: "CR", label: "Costa Rica" },
  { value: "EC", label: "Ecuador" },
  { value: "SV", label: "El Salvador" },
  { value: "GT", label: "Guatemala" },
  { value: "HN", label: "Honduras" },
  { value: "MX", label: "México" },
  { value: "NI", label: "Nicaragua" },
  { value: "PA", label: "Panamá" },
  { value: "PY", label: "Paraguay" },
  { value: "PE", label: "Perú" },
  { value: "DO", label: "Rep. Dominicana" },
  { value: "UY", label: "Uruguay" },
  { value: "VE", label: "Venezuela" },
  { value: "US", label: "Estados Unidos" },
  { value: "ES", label: "España" },
  { value: "OT", label: "Otro" },
];

export interface EmployeesOption {
  value: EmployeesRange;
  label: string;
}

export const EMPLOYEES_RANGES: EmployeesOption[] = [
  { value: "1-10", label: "1–10 empleados" },
  { value: "11-50", label: "11–50 empleados" },
  { value: "51-200", label: "51–200 empleados" },
  { value: "200+", label: "Más de 200" },
];

export interface CertificationOption {
  value: string;
  label: string;
}

export const CERTIFICATIONS: CertificationOption[] = [
  { value: "HACCP", label: "HACCP Codex" },
  { value: "ISO22000", label: "ISO 22000" },
  { value: "FSSC22000", label: "FSSC 22000" },
  { value: "BRC", label: "BRC / BRCGS" },
  { value: "FSMA", label: "FDA FSMA" },
  { value: "INVIMA", label: "INVIMA" },
  { value: "SENASAG", label: "SENASAG" },
];

export const CERT_NONE = "NONE";

export function getIndustryLabel(value: Industry): string {
  return INDUSTRIES.find((i) => i.value === value)?.label ?? value;
}

export function getCountryLabel(value: string): string {
  return COUNTRIES.find((c) => c.value === value)?.label ?? value;
}

export function getEmployeesLabel(value: EmployeesRange): string {
  return EMPLOYEES_RANGES.find((e) => e.value === value)?.label ?? value;
}

export function getCertificationLabels(values: string[]): string {
  if (values.length === 0) return "Ninguna aún";
  return values
    .map((v) => CERTIFICATIONS.find((c) => c.value === v)?.label ?? v)
    .join(", ");
}
