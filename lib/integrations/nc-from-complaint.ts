/**

 * Integración NC desde quejas de clientes (Paso 9).

 */



import { createNonconformityDraft } from "@/lib/integrations/nonconformity-draft";

import { asignarCapacitacionCorrectiva } from "@/lib/integrations/training-from-capa";

import type { NcSeverity } from "@/types/database";



type SupabaseClient = ReturnType<

  typeof import("@/lib/supabase/client").createClient

>;



export interface NcFromComplaintInput {

  organizationId: string;

  userId: string;

  complaintId: string;

  description: string;

  severity?: NcSeverity;

  lotNumber?: string | null;

  productAffected?: string | null;

}



export async function createNcFromComplaint(

  supabase: SupabaseClient,

  input: NcFromComplaintInput

) {

  return createNonconformityDraft(supabase, {

    organizationId: input.organizationId,

    userId: input.userId,

    origin: "complaint",

    originRefId: input.complaintId,

    description: input.description,

    severity: input.severity ?? "major",

    lotNumber: input.lotNumber,

    productAffected: input.productAffected,

  });

}



export { asignarCapacitacionCorrectiva };


