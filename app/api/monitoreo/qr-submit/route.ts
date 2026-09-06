import { NextResponse } from "next/server";
import { getFieldMonitorContext } from "@/lib/production-records/qr-context";
import { submitProductionRecord } from "@/lib/production-records/submit";
import { computeOperatorSignatureHash } from "@/lib/production-records/utils";
import type { FieldValuePayload, TemplateSnapshot } from "@/lib/production-records/utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Servidor sin configuración" }, { status: 500 });
  }

  const body = (await req.json()) as {
    token?: string;
    monitorName?: string;
    lotNumber?: string | null;
    deviationNotes?: string | null;
    values?: FieldValuePayload[];
    templateSnapshot?: TemplateSnapshot;
  };

  if (!body.token || !body.monitorName?.trim()) {
    return NextResponse.json({ error: "token y monitorName son requeridos" }, { status: 400 });
  }

  const context = await getFieldMonitorContext(body.token);
  if (!context) {
    return NextResponse.json({ error: "QR inválido o vencido" }, { status: 410 });
  }

  const submittedAt = new Date().toISOString();
  const clientSubmissionId = crypto.randomUUID();
  const signature = await computeOperatorSignatureHash({
    userId: body.monitorName.trim(),
    templateId: context.template.id,
    submissionId: clientSubmissionId,
    timestamp: submittedAt,
  });

  try {
    const result = await submitProductionRecord(admin, {
      organizationId: context.link.organization_id,
      userId: context.link.created_by,
      templateId: context.template.id,
      templateSnapshot: body.templateSnapshot ?? {
        template_id: context.template.id,
        name: context.template.name,
        area: context.template.area,
        sections: [],
      },
      area: context.template.area,
      lotNumber: body.lotNumber ?? null,
      deviationNotes: body.deviationNotes ?? null,
      values: body.values ?? [],
      operatorSignatureHash: signature,
      operatorSignedAt: submittedAt,
      submittedAt,
      clientSubmissionId,
      source: "qr",
      qrLinkId: context.link.id,
      monitorName: body.monitorName.trim(),
    });
    return NextResponse.json({ ok: true, submissionId: result.submissionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
