import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";
import { AuditPdfDocument } from "@/lib/export/audit-pdf-document";
import { LOGOS_BUCKET, loadOrgLogoImageBytes } from "@/lib/storage/org-logo";
import type { Audit, AuditChecklistItem, AuditFinding } from "@/types/database";
import type { ExportLang } from "@/lib/export/labels";

// Force Node.js runtime — react-pdf is incompatible with Edge runtime
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  let supabase;
  let organizationId: string;
  try {
    const session = await requirePermission(PERMISSIONS.audits.read);
    supabase = session.supabase;
    organizationId = session.profile.organization_id;
  } catch (error) {
    const { body, status } = authzResponse(error);
    return NextResponse.json(body, { status });
  }

  const url = new URL(req.url);
  const lang: ExportLang =
    url.searchParams.get("lang") === "en" ? "en" : "es";
  const auditorSign = url.searchParams.get("auditor") ?? undefined;
  const repSign = url.searchParams.get("rep") ?? undefined;

  const [
    { data: auditData },
    { data: itemsData },
    { data: findingsData },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("audits")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("audit_checklist_items")
      .select("*")
      .eq("audit_id", id)
      .order("position"),
    supabase
      .from("audit_findings")
      .select("*")
      .eq("audit_id", id)
      .order("created_at"),
    supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", organizationId)
      .single(),
  ]);

  if (!auditData)
    return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });

  const audit = auditData as Audit;
  const items = (itemsData ?? []) as AuditChecklistItem[];
  const findings = (findingsData ?? []) as AuditFinding[];
  const org = orgData as { name: string; logo_url: string | null } | null;

  let organizationLogoImage: { data: Uint8Array; format: "png" | "jpg" } | null =
    null;
  try {
    organizationLogoImage = await loadOrgLogoImageBytes(
      org?.logo_url,
      organizationId,
      async (objectPath) => {
        const { data, error } = await supabase.storage
          .from(LOGOS_BUCKET)
          .download(objectPath);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      }
    );
  } catch {
    organizationLogoImage = null;
  }
  if (!organizationLogoImage && org?.logo_url) {
    console.warn("[nura:logo] skipped untrusted or invalid organization logo");
  }

  const element = React.createElement(AuditPdfDocument, {
    audit,
    items,
    findings,
    organizationName: org?.name ?? "—",
    organizationLogoImage,
    lang,
    auditorSignature: auditorSign,
    orgRepSignature: repSign,
  }) as unknown as React.ReactElement<DocumentProps>;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(element);
  } catch (error) {
    if (!organizationLogoImage) throw error;
    console.warn("[nura:logo] pdf logo embed failed; rendering without logo");
    const fallback = React.createElement(AuditPdfDocument, {
      audit,
      items,
      findings,
      organizationName: org?.name ?? "—",
      organizationLogoImage: null,
      lang,
      auditorSignature: auditorSign,
      orgRepSignature: repSign,
    }) as unknown as React.ReactElement<DocumentProps>;
    buffer = await renderToBuffer(fallback);
  }

  const slug = audit.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  const prefix = lang === "en" ? "audit-report" : "informe";
  const filename = `${prefix}-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
