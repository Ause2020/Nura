/**
 * Auto-NC desde reclamos según umbral configurable (Paso 9).
 */

import { createNcFromComplaint } from "@/lib/integrations/nc-from-complaint";
import {
  parseAutoNcThreshold,
  shouldAutoCreateNc,
} from "@/lib/complaints/sla";
import type { ComplaintSeverity } from "@/types/database";

type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export async function autoCreateNcFromComplaintIfNeeded(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    userId: string;
    complaintId: string;
    complaintNumber: string;
    description: string;
    severity: ComplaintSeverity;
    lotNumber: string | null;
    productName: string | null;
    autoNcThreshold: unknown;
    existingNcId?: string | null;
  }
): Promise<{ ncId: string; ncNumber: string } | null> {
  if (input.existingNcId) return null;

  const threshold = parseAutoNcThreshold(input.autoNcThreshold);
  if (!shouldAutoCreateNc(input.severity, threshold)) return null;

  const ncSeverity =
    input.severity === "safety_critical" ? "critical" : "major";

  const result = await createNcFromComplaint(supabase, {
    organizationId: input.organizationId,
    userId: input.userId,
    complaintId: input.complaintId,
    description: `Reclamo ${input.complaintNumber}: ${input.description}`,
    severity: ncSeverity,
    lotNumber: input.lotNumber,
    productAffected: input.productName,
  });

  if (!result) return null;

  await supabase
    .from("customer_complaints")
    .update({
      nc_id: result.ncId,
      auto_nc_created: true,
    })
    .eq("id", input.complaintId);

  return result;
}
