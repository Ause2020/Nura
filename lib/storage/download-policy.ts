export const PRIVATE_DOWNLOAD_TTL_SECONDS = 5 * 60;

export const PRIVATE_DOWNLOAD_KINDS = [
  "document-version",
  "production-photo",
  "haccp-training",
  "haccp-validation-file",
  "audit-photo",
  "capa-evidence",
  "nc-evidence",
  "nc-photo",
] as const;

export type PrivateDownloadKind = (typeof PRIVATE_DOWNLOAD_KINDS)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_PATH_KEYS = ["path", "bucket", "storage_path", "file_url"] as const;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isPrivateDownloadKind(value: string): value is PrivateDownloadKind {
  return (PRIVATE_DOWNLOAD_KINDS as readonly string[]).includes(value);
}

export function storagePathBelongsToOrg(
  path: string,
  organizationId: string
): boolean {
  const first = path.split("/").filter(Boolean)[0];
  return Boolean(first && first === organizationId);
}

export function downloadAccessDecision(input: {
  authenticated: boolean;
  organizationId: string | null;
  resourceOrganizationId: string | null;
}): { status: 401 } | { status: 403 } | { status: 404 } | { status: 200 } {
  if (!input.authenticated) return { status: 401 };
  if (!input.organizationId) return { status: 403 };
  if (
    !input.resourceOrganizationId ||
    input.resourceOrganizationId !== input.organizationId
  ) {
    return { status: 404 };
  }
  return { status: 200 };
}

export type ParsedDownloadRequest =
  | {
      ok: true;
      kind: PrivateDownloadKind;
      resourceId: string;
      fileId?: string;
    }
  | { ok: false; error: "invalid" };

export function parseDownloadSearchParams(
  params: URLSearchParams
): ParsedDownloadRequest {
  for (const key of FORBIDDEN_PATH_KEYS) {
    if (params.has(key)) return { ok: false, error: "invalid" };
  }

  const kind = params.get("kind") ?? "";
  const resourceId = params.get("id") ?? "";
  const fileId = params.get("fileId");

  if (!isPrivateDownloadKind(kind) || !isUuid(resourceId)) {
    return { ok: false, error: "invalid" };
  }

  if (fileId && !isUuid(fileId)) {
    return { ok: false, error: "invalid" };
  }

  return {
    ok: true,
    kind,
    resourceId,
    fileId: fileId || undefined,
  };
}

export function parseDownloadJsonBody(body: unknown): ParsedDownloadRequest {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid" };
  const record = body as Record<string, unknown>;

  for (const key of FORBIDDEN_PATH_KEYS) {
    if (key in record) return { ok: false, error: "invalid" };
  }

  const kind = typeof record.kind === "string" ? record.kind : "";
  const resourceId = typeof record.id === "string" ? record.id : "";
  const fileId = typeof record.fileId === "string" ? record.fileId : undefined;

  if (!isPrivateDownloadKind(kind) || !isUuid(resourceId)) {
    return { ok: false, error: "invalid" };
  }
  if (fileId && !isUuid(fileId)) {
    return { ok: false, error: "invalid" };
  }

  return { ok: true, kind, resourceId, fileId };
}
