import {
  getPendingQrSubmissions,
  getPendingSubmissions,
  removePendingQrSubmission,
  removePendingSubmission,
} from "@/lib/production-records/offline";
import { submitProductionRecord } from "@/lib/production-records/submit";
import type {
  FieldValuePayload,
  TemplateSnapshot,
} from "@/lib/production-records/utils";
import { createClient } from "@/lib/supabase/client";

export async function syncQueuedProductionRecords(input: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  const pending = getPendingSubmissions().filter(
    (item) => item.organizationId === input.organizationId
  );
  if (pending.length === 0) return;

  const supabase = createClient();
  for (const item of pending) {
    try {
      await submitProductionRecord(supabase, {
        organizationId: item.organizationId,
        userId: input.userId,
        templateId: item.templateId,
        templateSnapshot: item.payload.templateSnapshot as TemplateSnapshot,
        area: item.payload.area,
        lotNumber: item.payload.lotNumber,
        deviationNotes: item.payload.deviationNotes,
        values: item.payload.values as FieldValuePayload[],
        operatorSignatureHash: item.payload.operatorSignatureHash,
        operatorSignedAt: item.payload.operatorSignedAt,
        submittedAt: item.payload.submittedAt,
        clientSubmissionId: item.clientSubmissionId,
        syncStatus: "synced",
        source: item.payload.source,
        monitorName: item.payload.monitorName,
      });
      removePendingSubmission(item.clientSubmissionId);
    } catch {
      // keep in queue for the next online attempt
    }
  }
}

export async function syncQueuedQrSubmissions(): Promise<void> {
  const pending = getPendingQrSubmissions();
  for (const item of pending) {
    try {
      const res = await fetch("/api/monitoreo/qr-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: item.token,
          monitorName: item.monitorName,
          lotNumber: item.lotNumber,
          deviationNotes: item.deviationNotes,
          values: item.values,
          templateSnapshot: item.templateSnapshot,
          clientSubmissionId: item.clientId,
        }),
      });
      if (res.ok || res.status === 400 || res.status === 410) {
        removePendingQrSubmission(item.clientId);
      }
    } catch {
      // keep in queue
    }
  }
}
