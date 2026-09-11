export const PRIVATE_STORAGE_BUCKETS = {
  controlledDocuments: "controlled-documents",
  productionRecordPhotos: "production-record-photos",
  haccpEvidence: "haccp-evidence",
  auditPhotos: "audit-photos",
  ncPhotos: "nc-photos",
} as const;

export type PrivateStorageBucket =
  (typeof PRIVATE_STORAGE_BUCKETS)[keyof typeof PRIVATE_STORAGE_BUCKETS];

export const PRIVATE_STORAGE_BUCKET_IDS: readonly PrivateStorageBucket[] =
  Object.values(PRIVATE_STORAGE_BUCKETS);

export const PUBLIC_STORAGE_BUCKETS = {
  logos: "logos",
} as const;

const OBJECT_MARKERS = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
] as const;

export function buildPrivateObjectPath(
  organizationId: string,
  entityId: string,
  fileName: string
): string {
  const ext = extensionOf(fileName);
  const id = globalThis.crypto.randomUUID();
  return `${organizationId}/${entityId}/${id}.${ext}`;
}

export function extractStoragePath(
  stored: string,
  bucket: string
): string | null {
  const value = stored.trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    return value.replace(/^\/+/, "");
  }

  try {
    const url = new URL(value);
    for (const marker of OBJECT_MARKERS) {
      const prefix = `${marker}${bucket}/`;
      const idx = url.pathname.indexOf(prefix);
      if (idx !== -1) {
        return decodeURIComponent(url.pathname.slice(idx + prefix.length));
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isSupabaseStorageUrl(stored: string, bucket: string): boolean {
  return extractStoragePath(stored, bucket) !== null && /^https?:\/\//i.test(stored.trim());
}

export function extractStorageRef(
  stored: string,
  fallbackBucket: string
): { bucket: string; path: string } | null {
  const value = stored.trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    return { bucket: fallbackBucket, path: value.replace(/^\/+/, "") };
  }

  for (const bucket of PRIVATE_STORAGE_BUCKET_IDS) {
    const path = extractStoragePath(value, bucket);
    if (path) return { bucket, path };
  }

  return null;
}

function extensionOf(fileName: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned || "bin";
}
