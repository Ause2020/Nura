import type {
  ProductionFieldType,
  ProductionFormField,
  ProductionFormSection,
} from "@/types/database";

export interface TemplateSnapshot {
  template_id: string;
  name: string;
  area: string | null;
  sections: Array<{
    id: string;
    title: string;
    sort_order: number;
    fields: ProductionFormField[];
  }>;
}

export function buildTemplateSnapshot(
  template: { id: string; name: string; area: string | null },
  sections: ProductionFormSection[],
  fields: ProductionFormField[]
): TemplateSnapshot {
  const fieldsBySection = new Map<string, ProductionFormField[]>();
  for (const field of fields) {
    const list = fieldsBySection.get(field.section_id) ?? [];
    list.push(field);
    fieldsBySection.set(field.section_id, list);
  }

  return {
    template_id: template.id,
    name: template.name,
    area: template.area,
    sections: [...sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({
        id: section.id,
        title: section.title,
        sort_order: section.sort_order,
        fields: [...(fieldsBySection.get(section.id) ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order
        ),
      })),
  };
}

export function isNumberOutOfRange(
  value: number,
  min: number | null,
  max: number | null
): boolean {
  if (min != null && value < min) return true;
  if (max != null && value > max) return true;
  return false;
}

export function isChecklistDeviation(value: string | null | undefined): boolean {
  return value === "no";
}

export async function computeOperatorSignatureHash(input: {
  userId: string;
  templateId: string;
  submissionId: string;
  timestamp: string;
}): Promise<string> {
  const payload = [
    input.userId,
    input.templateId,
    input.submissionId,
    input.timestamp,
  ].join("|");

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseFieldOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => (typeof value === "string" ? value : String(value ?? "")).trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parseFieldOptions(parsed);
    } catch {
      // comma-separated fallback
    }
    return trimmed
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

export function formatFieldLimits(
  field: Pick<ProductionFormField, "min_value" | "max_value" | "unit">
): string | null {
  const unit = field.unit?.trim();
  const suffix = unit ? ` ${unit}` : "";
  if (field.min_value != null && field.max_value != null) {
    return `Límite: ${field.min_value} – ${field.max_value}${suffix}`;
  }
  if (field.min_value != null) return `Límite: mínimo ${field.min_value}${suffix}`;
  if (field.max_value != null) return `Límite: máximo ${field.max_value}${suffix}`;
  if (unit) return `Unidad: ${unit}`;
  return null;
}

export interface FieldValuePayload {
  field_id: string;
  field_label: string;
  field_type: ProductionFieldType;
  value_text?: string | null;
  value_number?: number | null;
  value_json?: unknown;
  is_out_of_range: boolean;
}
