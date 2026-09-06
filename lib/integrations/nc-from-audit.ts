/**
 * Integración NC desde auditorías (Paso 4).
 * Conecta hallazgos "No conforme" al hub CAPA.
 */

import { createNonconformityDraft } from "@/lib/integrations/nonconformity-draft";
import type { NcSeverity } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export interface NcFromAuditInput {
  organizationId: string;
  userId: string;
  auditId: string;
  findingId: string;
  description: string;
  severity?: NcSeverity;
  area?: string | null;
  clauseReference?: string | null;
  evidenceUrl?: string | null;
}

export async function createNcFromAuditFinding(
  supabase: SupabaseClient,
  input: NcFromAuditInput
) {
  const description = [
    input.description,
    input.clauseReference ? `Cláusula: ${input.clauseReference}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const result = await createNonconformityDraft(supabase, {
    organizationId: input.organizationId,
    userId: input.userId,
    origin: "audit",
    originRefId: input.auditId,
    description,
    severity: input.severity ?? "major",
    area: input.area ?? null,
  });

  if (result && input.evidenceUrl) {
    await supabase
      .from("nonconformities")
      .update({ evidence_url: input.evidenceUrl })
      .eq("id", result.ncId);
  }

  return result;
}
