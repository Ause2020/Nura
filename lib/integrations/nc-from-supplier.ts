/**
 * Integración NC desde incidentes de proveedor (Paso 7).
 */

import { createNonconformityDraft } from "@/lib/integrations/nonconformity-draft";
import type { NcSeverity } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export interface NcFromSupplierInput {
  organizationId: string;
  userId: string;
  supplierId: string;
  supplierName: string;
  incidentId: string;
  description: string;
  severity?: NcSeverity;
}

export async function createNcFromSupplier(
  supabase: SupabaseClient,
  input: NcFromSupplierInput
) {
  const result = await createNonconformityDraft(supabase, {
    organizationId: input.organizationId,
    userId: input.userId,
    origin: "supplier",
    originRefId: input.incidentId,
    description: `Proveedor ${input.supplierName}: ${input.description}`,
    severity: input.severity ?? "major",
    supplierId: input.supplierId,
  });

  return result;
}
