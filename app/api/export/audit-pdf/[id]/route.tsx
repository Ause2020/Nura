import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { AuditPdfDocument } from "@/lib/export/audit-pdf-document";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditChecklistItem, AuditFinding } from "@/types/database";
import type { ExportLang } from "@/lib/export/labels";

// Force Node.js runtime — react-pdf is incompatible with Edge runtime
export const runtime = "nodejs";

interface Params {
  params: { id: string };
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const organizationId = (profile as { organization_id: string } | null)
    ?.organization_id;
  if (!organizationId)
    return NextResponse.json({ error: "No organization" }, { status: 403 });

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
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("audit_checklist_items")
      .select("*")
      .eq("audit_id", params.id)
      .order("position"),
    supabase
      .from("audit_findings")
      .select("*")
      .eq("audit_id", params.id)
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

  const element = React.createElement(AuditPdfDocument, {
    audit,
    items,
    findings,
    organizationName: org?.name ?? "—",
    organizationLogoUrl: org?.logo_url ?? null,
    lang,
    auditorSignature: auditorSign,
    orgRepSignature: repSign,
  }) as unknown as React.ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

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
