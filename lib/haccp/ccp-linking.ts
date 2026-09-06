import type { HaccpCcp } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export interface ParsedCriticalLimit {
  min: number | null;
  max: number | null;
  unit: string | null;
}

/** Parsea límites tipo "≥ 75°C", "72-85 °C", "pH 4.0-4.6" */
export function parseCriticalLimit(text: string): ParsedCriticalLimit {
  const normalized = text.replace(/,/g, ".").trim();
  const unitMatch = normalized.match(/(°C|°F|ppm|pH|%|bar|psi)\s*$/i);
  const unit = unitMatch ? unitMatch[1] : null;

  const rangeMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/
  );
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
      unit,
    };
  }

  const gteMatch = normalized.match(/(?:≥|>=|mín\.?|min\.?)\s*(\d+(?:\.\d+)?)/i);
  if (gteMatch) {
    return { min: Number(gteMatch[1]), max: null, unit };
  }

  const lteMatch = normalized.match(/(?:≤|<=|máx\.?|max\.?)\s*(\d+(?:\.\d+)?)/i);
  if (lteMatch) {
    return { min: null, max: Number(lteMatch[1]), unit };
  }

  const single = normalized.match(/(\d+(?:\.\d+)?)/);
  if (single) {
    const value = Number(single[1]);
    return { min: value, max: value, unit };
  }

  return { min: null, max: null, unit };
}

export function getCcpLinkStatus(
  ccp: Pick<HaccpCcp, "production_template_id" | "production_field_id">
): "linked" | "pending" {
  return ccp.production_template_id && ccp.production_field_id
    ? "linked"
    : "pending";
}

export async function syncCcpLimitsToProductionField(
  supabase: SupabaseClient,
  ccp: Pick<
    HaccpCcp,
    | "id"
    | "organization_id"
    | "production_field_id"
    | "critical_limit_min"
    | "critical_limit_max"
    | "critical_limit_unit"
    | "critical_limit"
  >
): Promise<boolean> {
  if (!ccp.production_field_id) return false;

  const parsed =
    ccp.critical_limit_min != null || ccp.critical_limit_max != null
      ? {
          min: ccp.critical_limit_min,
          max: ccp.critical_limit_max,
          unit: ccp.critical_limit_unit,
        }
      : parseCriticalLimit(ccp.critical_limit);

  const { error } = await supabase
    .from("production_form_fields")
    .update({
      min_value: parsed.min,
      max_value: parsed.max,
      unit: parsed.unit,
    })
    .eq("id", ccp.production_field_id)
    .eq("organization_id", ccp.organization_id);

  return !error;
}

export async function findLinkedCcpForSubmission(
  supabase: SupabaseClient,
  organizationId: string,
  templateId: string,
  fieldIds: string[]
): Promise<string | null> {
  if (fieldIds.length > 0) {
    const { data: byField } = await supabase
      .from("haccp_ccps")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("production_template_id", templateId)
      .in("production_field_id", fieldIds)
      .limit(1)
      .maybeSingle();

    if (byField) return (byField as { id: string }).id;
  }

  const { data: byTemplate } = await supabase
    .from("haccp_ccps")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("production_template_id", templateId)
    .not("production_field_id", "is", null)
    .limit(1)
    .maybeSingle();

  return byTemplate ? (byTemplate as { id: string }).id : null;
}
