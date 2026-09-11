import type { SupabaseClient } from "@supabase/supabase-js";
import { extractStorageRef } from "@/lib/storage/paths";
import {
  PRIVATE_DOWNLOAD_TTL_SECONDS,
  storagePathBelongsToOrg,
  type PrivateDownloadKind,
} from "@/lib/storage/download-policy";

type LookupRow = {
  organizationId: string;
  bucket: string;
  stored: string | null;
};

export type CreatePrivateDownloadUrlResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; status: 400 | 404 };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function nestedOrgId(row: Record<string, unknown>, key: string): string | null {
  const nested = row[key];
  if (Array.isArray(nested)) {
    const first = asRecord(nested[0]);
    return typeof first?.organization_id === "string" ? first.organization_id : null;
  }
  const obj = asRecord(nested);
  return typeof obj?.organization_id === "string" ? obj.organization_id : null;
}

async function loadOrgScopedRow(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  resourceId: string,
  organizationId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("id", resourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return asRecord(data);
}

async function resolveDownloadTarget(
  supabase: SupabaseClient,
  organizationId: string,
  kind: PrivateDownloadKind,
  resourceId: string,
  fileId?: string
): Promise<LookupRow | null> {
  switch (kind) {
    case "document-version": {
      const row = await loadOrgScopedRow(
        supabase,
        "document_versions",
        "organization_id, file_url",
        resourceId,
        organizationId
      );
      return row
        ? {
            organizationId,
            bucket: "controlled-documents",
            stored: typeof row.file_url === "string" ? row.file_url : null,
          }
        : null;
    }
    case "production-photo": {
      const row = await loadOrgScopedRow(
        supabase,
        "production_form_submission_values",
        "organization_id, field_type, value_text",
        resourceId,
        organizationId
      );
      if (!row || row.field_type !== "photo") return null;
      return {
        organizationId,
        bucket: "production-record-photos",
        stored: typeof row.value_text === "string" ? row.value_text : null,
      };
    }
    case "audit-photo": {
      const row = await loadOrgScopedRow(
        supabase,
        "audit_checklist_items",
        "organization_id, photo_url",
        resourceId,
        organizationId
      );
      return row
        ? {
            organizationId,
            bucket: "audit-photos",
            stored: typeof row.photo_url === "string" ? row.photo_url : null,
          }
        : null;
    }
    case "capa-evidence": {
      const row = await loadOrgScopedRow(
        supabase,
        "capa_actions",
        "organization_id, evidence_url",
        resourceId,
        organizationId
      );
      return row
        ? {
            organizationId,
            bucket: "audit-photos",
            stored: typeof row.evidence_url === "string" ? row.evidence_url : null,
          }
        : null;
    }
    case "nc-evidence": {
      const row = await loadOrgScopedRow(
        supabase,
        "nonconformities",
        "organization_id, evidence_url",
        resourceId,
        organizationId
      );
      return row
        ? {
            organizationId,
            bucket: "audit-photos",
            stored: typeof row.evidence_url === "string" ? row.evidence_url : null,
          }
        : null;
    }
    case "nc-photo": {
      const row = await loadOrgScopedRow(
        supabase,
        "nc_photos",
        "organization_id, photo_url",
        resourceId,
        organizationId
      );
      return row
        ? {
            organizationId,
            bucket: "nc-photos",
            stored: typeof row.photo_url === "string" ? row.photo_url : null,
          }
        : null;
    }
    case "haccp-training": {
      const { data, error } = await supabase
        .from("haccp_teams")
        .select("id, training_evidence, haccp_plans!inner(organization_id)")
        .eq("id", resourceId)
        .eq("haccp_plans.organization_id", organizationId)
        .maybeSingle();
      if (error || !data) return null;
      const row = asRecord(data);
      if (!row || nestedOrgId(row, "haccp_plans") !== organizationId) return null;
      const evidence = asRecord(row.training_evidence);
      return {
        organizationId,
        bucket: "haccp-evidence",
        stored: typeof evidence?.url === "string" ? evidence.url : null,
      };
    }
    case "haccp-validation-file": {
      if (!fileId) return null;
      const { data, error } = await supabase
        .from("haccp_validations")
        .select("id, evidence_files, haccp_plans!inner(organization_id)")
        .or(`id.eq.${resourceId},plan_id.eq.${resourceId}`)
        .eq("haccp_plans.organization_id", organizationId)
        .maybeSingle();
      if (error || !data) return null;
      const row = asRecord(data);
      if (!row || nestedOrgId(row, "haccp_plans") !== organizationId) return null;
      const files = Array.isArray(row.evidence_files) ? row.evidence_files : [];
      const match = files
        .map(asRecord)
        .find((file) => file?.id === fileId);
      return {
        organizationId,
        bucket: "haccp-evidence",
        stored: typeof match?.url === "string" ? match.url : null,
      };
    }
    default:
      return null;
  }
}

export async function createPrivateDownloadUrl(input: {
  supabase: SupabaseClient;
  organizationId: string;
  kind: PrivateDownloadKind;
  resourceId: string;
  fileId?: string;
}): Promise<CreatePrivateDownloadUrlResult> {
  const target = await resolveDownloadTarget(
    input.supabase,
    input.organizationId,
    input.kind,
    input.resourceId,
    input.fileId
  );

  if (!target || !target.stored) {
    return { ok: false, status: 404 };
  }

  const ref = extractStorageRef(target.stored, target.bucket);
  if (!ref || !storagePathBelongsToOrg(ref.path, input.organizationId)) {
    return { ok: false, status: 404 };
  }

  const { data, error } = await input.supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, PRIVATE_DOWNLOAD_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return { ok: false, status: 404 };
  }

  return {
    ok: true,
    url: data.signedUrl,
    expiresIn: PRIVATE_DOWNLOAD_TTL_SECONDS,
  };
}
