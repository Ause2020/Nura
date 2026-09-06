import { createClient } from "@/lib/supabase/client";
import type { HaccpDbClient } from "@/lib/haccp-plan/db";

export interface PccMonitoringRecord {
  id: string;
  organizationId: string;
  pccReferenceId: string;
  recordedAt: string;
  shift: string;
  parameter: string;
  measuredValue: string;
  responsible: string;
  observations: string;
  conforms: boolean | null;
  createdBy: string | null;
}

function mapRecord(row: Record<string, unknown>): PccMonitoringRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    pccReferenceId: String(row.pcc_reference_id),
    recordedAt: String(row.recorded_at),
    shift: typeof row.shift === "string" ? row.shift : "",
    parameter: typeof row.parameter === "string" ? row.parameter : "",
    measuredValue: typeof row.measured_value === "string" ? row.measured_value : "",
    responsible: typeof row.responsible === "string" ? row.responsible : "",
    observations: typeof row.observations === "string" ? row.observations : "",
    conforms: typeof row.conforms === "boolean" ? row.conforms : null,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

export async function listMonitoringRecords(
  organizationId: string,
  client?: HaccpDbClient
): Promise<PccMonitoringRecord[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("haccp_monitoring_records")
    .select("*")
    .eq("organization_id", organizationId)
    .order("recorded_at", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []).map((row: Record<string, unknown>) => mapRecord(row));
}

export async function createMonitoringRecord(input: {
  organizationId: string;
  userId: string;
  pccReferenceId: string;
  recordedAt: string;
  shift: string;
  parameter: string;
  measuredValue: string;
  responsible: string;
  observations: string;
  conforms: boolean;
}): Promise<PccMonitoringRecord> {
  const { data, error } = await createClient()
    .from("haccp_monitoring_records")
    .insert({
      organization_id: input.organizationId,
      pcc_reference_id: input.pccReferenceId,
      recorded_at: input.recordedAt,
      shift: input.shift,
      parameter: input.parameter,
      measured_value: input.measuredValue,
      responsible: input.responsible,
      observations: input.observations,
      conforms: input.conforms,
      created_by: input.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo guardar el registro PCC");
  }
  return mapRecord(data as Record<string, unknown>);
}
