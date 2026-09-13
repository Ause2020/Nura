/**
 * Integración NC/CAPA — borrador pre-rellenado desde otros módulos.
 */

import { shouldQuarantineLot } from "@/lib/capa/quarantine";
import {
  computeCapaSignatureHash,
} from "@/lib/capa/workflow";
import { generateNcNumber, getSuggestedDueDate } from "@/lib/capa/utils";
import type { CapaStage, NcOrigin, NcSeverity } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export interface NonconformityDraftInput {
  organizationId: string;
  userId: string;
  origin: NcOrigin;
  originRefId: string;
  description: string;
  severity?: NcSeverity;
  lotNumber?: string | null;
  area?: string | null;
  productAffected?: string | null;
  assignedTo?: string | null;
  quarantineThreshold?: NcSeverity;
}

export async function createNonconformityDraft(
  supabase: SupabaseClient,
  input: NonconformityDraftInput
): Promise<{ ncId: string; ncNumber: string } | null> {
  const severity = input.severity ?? "major";
  const ncNumber = await generateNcNumber(supabase, input.organizationId);
  const dueDate = getSuggestedDueDate(severity);
  const lotQuarantined = shouldQuarantineLot(
    severity,
    input.quarantineThreshold ?? "major",
    input.lotNumber
  );

  const { data, error } = await supabase
    .from("nonconformities")
    .insert({
      organization_id: input.organizationId,
      nc_number: ncNumber,
      origin: input.origin,
      origin_ref_id: input.originRefId,
      description: input.description,
      severity,
      lot_number: input.lotNumber ?? null,
      area: input.area ?? null,
      product_affected: input.productAffected ?? null,
      detected_by: input.userId,
      assigned_to: input.assignedTo ?? input.userId,
      due_date: dueDate,
      capa_target_close_date: dueDate,
      status: "open",
      capa_stage: "identification" satisfies CapaStage,
      effectiveness_result: "pending",
      lot_quarantined: lotQuarantined,
    })
    .select("id, nc_number")
    .single();

  if (error || !data) return null;

  const row = data as { id: string; nc_number: string };
  const now = new Date().toISOString();
  const signatureHash = await computeCapaSignatureHash({
    userId: input.userId,
    ncId: row.id,
    fromStage: null,
    toStage: "identification",
    timestamp: now,
  });

  await supabase.from("capa_stage_log").insert({
    organization_id: input.organizationId,
    nc_id: row.id,
    from_stage: null,
    to_stage: "identification",
    changed_by: input.userId,
    comment: `NC auto-generada desde ${input.origin}`,
    signature_hash: signatureHash,
  });

  const { notifyOrgManagers } = await import("@/lib/notifications");
  await notifyOrgManagers(supabase, input.organizationId, {
    type: "nc_new",
    title: "NC generada automáticamente",
    message: `${row.nc_number}: ${input.description.slice(0, 80)}`,
    link: `/capa/${row.id}`,
    dedupKey: `nc-auto-${input.origin}-${input.originRefId}`,
  });

  return { ncId: row.id, ncNumber: row.nc_number };
}
