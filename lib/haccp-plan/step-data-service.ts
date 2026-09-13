import { createClient } from "@/lib/supabase/client";
import { LOCAL_BACKUP_KEY } from "@/lib/haccp-plan/constants";
import type { HaccpDbClient } from "@/lib/haccp-plan/db";
import type {
  Step10Payload,
  Step11Payload,
  Step7Payload,
  Step8Payload,
  Step9Payload,
} from "@/lib/haccp-plan/types";
import { rememberWrite, shouldSkipWrite } from "@/lib/haccp-plan/write-guard";

export type StepPayloadMap = {
  7: Step7Payload;
  8: Step8Payload;
  9: Step9Payload;
  10: Step10Payload;
  11: Step11Payload;
};

function readLocal(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BACKUP_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function writeLocal(stepId: number, data: unknown) {
  if (typeof window === "undefined") return;
  const current = readLocal();
  current[String(stepId)] = data;
  localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(current));
}

function stepWriteKey(organizationId: string, stepId: number) {
  return `step:${organizationId}:${stepId}`;
}

export function writeStepLocalBackup<K extends keyof StepPayloadMap>(
  stepId: K,
  payload: StepPayloadMap[K]
) {
  writeLocal(stepId, payload);
}

export function readStepLocalBackup(): Partial<{
  [K in keyof StepPayloadMap]: StepPayloadMap[K];
}> {
  const raw = readLocal();
  const next: Partial<{ [K in keyof StepPayloadMap]: StepPayloadMap[K] }> = {};
  if (raw["7"]) next[7] = raw["7"] as StepPayloadMap[7];
  if (raw["8"]) next[8] = raw["8"] as StepPayloadMap[8];
  if (raw["9"]) next[9] = raw["9"] as StepPayloadMap[9];
  if (raw["10"]) next[10] = raw["10"] as StepPayloadMap[10];
  if (raw["11"]) next[11] = raw["11"] as StepPayloadMap[11];
  return next;
}

export function primeStepDataWrites(
  organizationId: string,
  stepData: { [K in keyof StepPayloadMap]?: StepPayloadMap[K] | null }
) {
  for (const stepId of [7, 8, 9, 10, 11] as const) {
    const payload = stepData[stepId];
    if (payload) {
      rememberWrite(stepWriteKey(organizationId, stepId), payload);
    }
  }
}

export async function getStepData<K extends keyof StepPayloadMap>(
  organizationId: string,
  stepId: K,
  client?: HaccpDbClient
): Promise<StepPayloadMap[K] | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("haccp_step_data")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("step_id", stepId)
    .maybeSingle();

  if (error) {
    const local = readLocal()[String(stepId)];
    return (local as StepPayloadMap[K]) ?? null;
  }

  if (!data) {
    const local = readLocal()[String(stepId)];
    if (local) {
      await saveStepData(organizationId, stepId, local as StepPayloadMap[K]);
      return local as StepPayloadMap[K];
    }
    return null;
  }

  const payload = (data as { data: StepPayloadMap[K] }).data;
  rememberWrite(stepWriteKey(organizationId, stepId), payload);
  return payload;
}

export async function saveStepData<K extends keyof StepPayloadMap>(
  organizationId: string,
  stepId: K,
  payload: StepPayloadMap[K]
) {
  writeLocal(stepId, payload);
  const key = stepWriteKey(organizationId, stepId);
  if (shouldSkipWrite(key, payload)) return;
  const { error } = await createClient().from("haccp_step_data").upsert(
    {
      organization_id: organizationId,
      step_id: stepId,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,step_id" }
  );
  if (error) throw new Error(error.message);
  rememberWrite(key, payload);
}

export async function getAllStepData(organizationId: string, client?: HaccpDbClient) {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("haccp_step_data")
    .select("step_id, data")
    .eq("organization_id", organizationId)
    .in("step_id", [7, 8, 9, 10, 11]);

  const byStep: Partial<Record<keyof StepPayloadMap, StepPayloadMap[keyof StepPayloadMap]>> =
    {};

  if (!error && data) {
    for (const row of data as { step_id: number; data: unknown }[]) {
      const stepId = row.step_id as keyof StepPayloadMap;
      if (stepId === 7 || stepId === 8 || stepId === 9 || stepId === 10 || stepId === 11) {
        byStep[stepId] = row.data as StepPayloadMap[typeof stepId];
      }
    }
  }

  const result = {
    7: (byStep[7] as StepPayloadMap[7] | undefined) ?? null,
    8: (byStep[8] as StepPayloadMap[8] | undefined) ?? null,
    9: (byStep[9] as StepPayloadMap[9] | undefined) ?? null,
    10: (byStep[10] as StepPayloadMap[10] | undefined) ?? null,
    11: (byStep[11] as StepPayloadMap[11] | undefined) ?? null,
  };
  primeStepDataWrites(organizationId, result);
  return result;
}
