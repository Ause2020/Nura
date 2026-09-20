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
import { startNavTimer } from "@/lib/perf/dev-time";

const HACCP_NAV = { path: "/haccp" };

export type StepPayloadMap = {
  7: Step7Payload;
  8: Step8Payload;
  9: Step9Payload;
  10: Step10Payload;
  11: Step11Payload;
};

export type StepDataId = keyof StepPayloadMap;

export type LoadedStepData = Partial<{
  [K in StepDataId]: StepPayloadMap[K] | null;
}>;

export function requiredStepDataIds(currentStep: number): StepDataId[] {
  if (currentStep === 7) return [7];
  if (currentStep === 8) return [7, 8];
  if (currentStep === 9) return [7, 8, 9];
  if (currentStep === 10) return [7, 8, 10];
  if (currentStep === 11) return [11];
  return [];
}

export function isStepDataKeyLoaded(
  data: LoadedStepData,
  stepId: StepDataId
): boolean {
  return Object.prototype.hasOwnProperty.call(data, stepId);
}

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

export async function getStepDataForSteps(
  organizationId: string,
  stepIds: StepDataId[],
  client?: HaccpDbClient
): Promise<LoadedStepData> {
  const unique = [...new Set(stepIds)];
  const result: LoadedStepData = {};
  if (unique.length === 0) return result;

  const supabase = client ?? createClient();
  const endStepQuery = startNavTimer(
    "PAGE",
    `haccp_step_data ${unique.join(",")}`,
    HACCP_NAV
  );
  const { data, error } = await supabase
    .from("haccp_step_data")
    .select("step_id, data")
    .eq("organization_id", organizationId)
    .in("step_id", unique);
  endStepQuery();

  if (error) {
    throw new Error(error.message);
  }

  const byStep: Partial<Record<StepDataId, StepPayloadMap[StepDataId]>> = {};
  if (data) {
    for (const row of data as { step_id: number; data: unknown }[]) {
      const stepId = row.step_id as StepDataId;
      if (unique.includes(stepId)) {
        byStep[stepId] = row.data as StepPayloadMap[typeof stepId];
      }
    }
  }

  for (const stepId of unique) {
    const payload = byStep[stepId];
    if (stepId === 7) result[7] = (payload as StepPayloadMap[7] | undefined) ?? null;
    if (stepId === 8) result[8] = (payload as StepPayloadMap[8] | undefined) ?? null;
    if (stepId === 9) result[9] = (payload as StepPayloadMap[9] | undefined) ?? null;
    if (stepId === 10) result[10] = (payload as StepPayloadMap[10] | undefined) ?? null;
    if (stepId === 11) result[11] = (payload as StepPayloadMap[11] | undefined) ?? null;
  }
  primeStepDataWrites(organizationId, result);
  return result;
}

export async function getAllStepData(organizationId: string, client?: HaccpDbClient) {
  const loaded = await getStepDataForSteps(
    organizationId,
    [7, 8, 9, 10, 11],
    client
  );
  return {
    7: loaded[7] ?? null,
    8: loaded[8] ?? null,
    9: loaded[9] ?? null,
    10: loaded[10] ?? null,
    11: loaded[11] ?? null,
  };
}
