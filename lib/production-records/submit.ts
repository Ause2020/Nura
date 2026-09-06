import { findLinkedCcpForSubmission } from "@/lib/haccp/ccp-linking";
import { createNonconformityDraft } from "@/lib/integrations/nonconformity-draft";
import type { FieldValuePayload, TemplateSnapshot } from "@/lib/production-records/utils";
import type {
  ProductionSubmissionStatus,
  ProductionSyncStatus,
} from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export type MonitoringSource = "form" | "qr" | "ocr";

export interface SubmitProductionRecordInput {
  organizationId: string;
  userId: string | null;
  templateId: string;
  templateSnapshot: TemplateSnapshot;
  area: string | null;
  lotNumber: string | null;
  deviationNotes: string | null;
  values: FieldValuePayload[];
  operatorSignatureHash: string;
  operatorSignedAt: string;
  submittedAt: string;
  clientSubmissionId?: string | null;
  syncStatus?: ProductionSyncStatus;
  source?: MonitoringSource;
  qrLinkId?: string | null;
  monitorName?: string | null;
}

export async function submitProductionRecord(
  supabase: SupabaseClient,
  input: SubmitProductionRecordInput
): Promise<{ submissionId: string; ncId: string | null }> {
  const hasDeviation =
    input.values.some((v) => v.is_out_of_range) ||
    input.values.some(
      (v) => v.field_type === "checklist" && v.value_text === "no"
    );

  const status: ProductionSubmissionStatus = hasDeviation ? "deviation" : "ok";

  const { data: submissionData, error: submissionError } = await supabase
    .from("production_form_submissions")
    .insert({
      organization_id: input.organizationId,
      template_id: input.templateId,
      template_snapshot: input.templateSnapshot,
      area: input.area,
      lot_number: input.lotNumber,
      status,
      sync_status: input.syncStatus ?? "synced",
      has_deviation: hasDeviation,
      deviation_notes: input.deviationNotes,
      operator_signature_hash: input.operatorSignatureHash,
      operator_signed_at: input.operatorSignedAt,
      submitted_by: input.userId,
      submitted_at: input.submittedAt,
      client_submission_id: input.clientSubmissionId ?? null,
      source: input.source ?? "form",
      qr_link_id: input.qrLinkId ?? null,
      monitor_name: input.monitorName ?? null,
    })
    .select("id")
    .single();

  if (submissionError || !submissionData) {
    throw new Error(submissionError?.message ?? "No se pudo guardar el registro");
  }

  const submissionId = (submissionData as { id: string }).id;

  const linkedCcpId = await findLinkedCcpForSubmission(
    supabase,
    input.organizationId,
    input.templateId,
    input.values.map((v) => v.field_id)
  );

  if (linkedCcpId) {
    await supabase
      .from("production_form_submissions")
      .update({ haccp_ccp_id: linkedCcpId })
      .eq("id", submissionId);
  }

  if (input.values.length > 0) {
    const { error: valuesError } = await supabase
      .from("production_form_submission_values")
      .insert(
        input.values.map((v) => ({
          organization_id: input.organizationId,
          submission_id: submissionId,
          field_id: v.field_id,
          field_label: v.field_label,
          field_type: v.field_type,
          value_text: v.value_text ?? null,
          value_number: v.value_number ?? null,
          value_json: v.value_json ?? null,
          is_out_of_range: v.is_out_of_range,
        }))
      );

    if (valuesError) {
      throw new Error(valuesError.message);
    }
  }

  let ncId: string | null = null;

  if (hasDeviation && input.userId) {
    const outOfRange = input.values.filter((v) => v.is_out_of_range);
    const checklistNo = input.values.filter(
      (v) => v.field_type === "checklist" && v.value_text === "no"
    );

    const parts: string[] = [];
    for (const v of outOfRange) {
      parts.push(
        `${v.field_label}: ${v.value_number}${v.is_out_of_range ? " (fuera de rango)" : ""}`
      );
    }
    for (const v of checklistNo) {
      parts.push(`${v.field_label}: No conforme`);
    }

    const description = [
      `Registro de producción — ${input.templateSnapshot.name}`,
      ...parts,
      input.deviationNotes ? `Acción/comentario: ${input.deviationNotes}` : null,
    ]
      .filter(Boolean)
      .join(". ");

    const nc = await createNonconformityDraft(supabase, {
      organizationId: input.organizationId,
      userId: input.userId,
      origin: "production_record",
      originRefId: submissionId,
      description,
      severity: outOfRange.length > 0 ? "major" : "minor",
      lotNumber: input.lotNumber,
      area: input.area ?? input.templateSnapshot.area,
      productAffected: input.templateSnapshot.name,
      haccpCcpId: linkedCcpId,
    });

    if (nc) {
      ncId = nc.ncId;
      await supabase
        .from("production_form_submissions")
        .update({ nc_id: ncId })
        .eq("id", submissionId);
    }
  }

  return { submissionId, ncId };
}
