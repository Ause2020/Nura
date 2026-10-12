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
}> & {
  updatedAtMs?: Partial<Record<StepDataId, number>>;
};

type LocalEnvelope = { data: unknown; savedAt: number };

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

function unwrapLocal(raw: unknown): LocalEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if ("data" in record && typeof record.savedAt === "number") {
    return { data: record.data, savedAt: record.savedAt };
  }
  return { data: raw, savedAt: 0 };
}

function writeLocal(stepId: number, data: unknown) {
  if (typeof window === "undefined") return;
  const current = readLocal();
  current[String(stepId)] = { data, savedAt: Date.now() };
  localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(current));
}

function assignStepPayload<K extends StepDataId>(
  target: Partial<Record<StepDataId, StepPayloadMap[StepDataId] | null>>,
  stepId: K,
  payload: StepPayloadMap[K] | null
) {
  target[stepId] = payload;
}

function payloadLooksEmpty(stepId: StepDataId, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true;
  const record = payload as Record<string, unknown>;
  if (stepId === 7) return !Array.isArray(record.hazards) || record.hazards.length === 0;
  if (stepId === 8) {
    return !Array.isArray(record.criticalLimits) || record.criticalLimits.length === 0;
  }
  if (stepId === 9) {
    return !Array.isArray(record.monitoringPlans) || record.monitoringPlans.length === 0;
  }
  if (stepId === 10) {
    return !Array.isArray(record.correctiveActions) || record.correctiveActions.length === 0;
  }
  return !record.verificationPlan;
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
  const next: Partial<{ [K in keyof StepPayloadMap]: StepPayloadMap[K] }> = {};
  for (const stepId of [7, 8, 9, 10, 11] as const) {
    const envelope = unwrapLocal(readLocal()[String(stepId)]);
    if (envelope?.data) {
      assignStepPayload(
        next,
        stepId,
        envelope.data as StepPayloadMap[typeof stepId]
      );
    }
  }
  return next;
}

export function mergeLocalStepData(
  data: LoadedStepData,
  organizationId?: string
): LoadedStepData {
  const next: LoadedStepData = { ...data, updatedAtMs: { ...data.updatedAtMs } };
  const toPush: StepDataId[] = [];
  for (const stepId of [7, 8, 9, 10, 11] as const) {
    if (!isStepDataKeyLoaded(data, stepId)) continue;
    const envelope = unwrapLocal(readLocal()[String(stepId)]);
    if (!envelope?.data) continue;
    const server = data[stepId];
    const serverMs = data.updatedAtMs?.[stepId] ?? 0;
    const preferLocal =
      payloadLooksEmpty(stepId, server) ||
      (envelope.savedAt > 0 && envelope.savedAt > serverMs);
    if (!preferLocal) continue;
    assignStepPayload(
      next,
      stepId,
      envelope.data as StepPayloadMap[typeof stepId]
    );
    if (envelope.savedAt > serverMs && !payloadLooksEmpty(stepId, envelope.data)) {
      toPush.push(stepId);
    }
  }
  if (organizationId && toPush.length > 0) {
    void Promise.all(
      toPush.map((stepId) => {
        const payload = next[stepId];
        if (!payload) return Promise.resolve();
        return saveStepData(organizationId, stepId, payload).catch(() => undefined);
      })
    );
  }
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
    const local = unwrapLocal(readLocal()[String(stepId)])?.data;
    return (local as StepPayloadMap[K]) ?? null;
  }

  if (!data) {
    const local = unwrapLocal(readLocal()[String(stepId)])?.data;
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
    .select("step_id, data, updated_at")
    .eq("organization_id", organizationId)
    .in("step_id", unique);
  endStepQuery();

  if (error) {
    const local = readStepLocalBackup();
    const fallback: LoadedStepData = { updatedAtMs: {} };
    for (const stepId of unique) {
      assignStepPayload(fallback, stepId, local[stepId] ?? null);
    }
    return fallback;
  }

  const byStep: Partial<Record<StepDataId, StepPayloadMap[StepDataId]>> = {};
  const updatedAtMs: Partial<Record<StepDataId, number>> = {};
  if (data) {
    for (const row of data as {
      step_id: number;
      data: unknown;
      updated_at: string | null;
    }[]) {
      const stepId = row.step_id as StepDataId;
      if (unique.includes(stepId)) {
        byStep[stepId] = row.data as StepPayloadMap[typeof stepId];
        updatedAtMs[stepId] = row.updated_at
          ? new Date(row.updated_at).getTime()
          : 0;
      }
    }
  }

  result.updatedAtMs = updatedAtMs;
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
