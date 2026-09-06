/**
 * Modo offline — cola local preparada para sincronización.
 *
 * TODO v2: migrar a IndexedDB, Service Worker y reintentos con backoff.
 * Hoy: localStorage + sync al volver online en el ejecutor de formularios.
 */

export const OFFLINE_QUEUE_KEY = "nura-production-records-pending";

export interface PendingProductionSubmission {
  clientSubmissionId: string;
  organizationId: string;
  templateId: string;
  payload: {
    area: string | null;
    lotNumber: string | null;
    deviationNotes: string | null;
    values: unknown[];
    templateSnapshot: unknown;
    operatorSignatureHash: string;
    operatorSignedAt: string;
    submittedAt: string;
  };
  queuedAt: string;
}

export function getPendingSubmissions(): PendingProductionSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingProductionSubmission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function queuePendingSubmission(entry: PendingProductionSubmission): void {
  const list = getPendingSubmissions().filter(
    (item) => item.clientSubmissionId !== entry.clientSubmissionId
  );
  list.push(entry);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
}

export function removePendingSubmission(clientSubmissionId: string): void {
  const list = getPendingSubmissions().filter(
    (item) => item.clientSubmissionId !== clientSubmissionId
  );
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
