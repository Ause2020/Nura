import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitProductionRecord } from "@/lib/production-records/submit";
import {
  buildTemplateSnapshot,
  computeOperatorSignatureHash,
  type FieldValuePayload,
} from "@/lib/production-records/utils";
import type {
  ProductionFieldType,
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

export async function POST(req: Request) {
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

  const body = await req.json() as {
    templateId: string;
    lotNumber?: string | null;
    area?: string | null;
    deviationNotes?: string | null;
    values: Array<{
      field_id: string;
      field_label: string;
      field_type: ProductionFieldType;
      value_text?: string | null;
      value_number?: number | null;
      is_out_of_range?: boolean;
    }>;
  };

  const { templateId, lotNumber, area, deviationNotes, values } = body;
  if (!templateId)
    return NextResponse.json({ error: "templateId requerido" }, { status: 400 });

  // Fetch template + sections + fields
  const [{ data: templateData }, { data: sectionsData }, { data: fieldsData }] =
    await Promise.all([
      supabase
        .from("production_form_templates")
        .select("*")
        .eq("id", templateId)
        .eq("organization_id", organizationId)
        .single(),
      supabase
        .from("production_form_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order"),
      supabase
        .from("production_form_fields")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order"),
    ]);

  if (!templateData)
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const template = templateData as ProductionFormTemplate;
  const sections = (sectionsData ?? []) as ProductionFormSection[];
  const fields = (fieldsData ?? []) as ProductionFormField[];
  const snapshot = buildTemplateSnapshot(template, sections, fields);

  const now = new Date().toISOString();
  const operatorSignedAt = now;
  // computeOperatorSignatureHash requires a submissionId; for quick capture
  // we use a client-generated placeholder that gets replaced on insert.
  const clientSubmissionId = crypto.randomUUID();
  const operatorSignatureHash = await computeOperatorSignatureHash({
    userId: user.id,
    templateId,
    submissionId: clientSubmissionId,
    timestamp: now,
  });

  const fieldValuePayload: FieldValuePayload[] = (values ?? []).map((v) => ({
    field_id: v.field_id,
    field_label: v.field_label,
    field_type: v.field_type,
    value_text: v.value_text ?? null,
    value_number: v.value_number ?? null,
    value_json: null,
    is_out_of_range: v.is_out_of_range ?? false,
  }));

  try {
    const { submissionId, ncId } = await submitProductionRecord(supabase, {
      organizationId,
      userId: user.id,
      templateId,
      templateSnapshot: snapshot,
      area: area ?? null,
      lotNumber: lotNumber ?? null,
      deviationNotes: deviationNotes ?? null,
      values: fieldValuePayload,
      operatorSignatureHash,
      operatorSignedAt,
      submittedAt: now,
    });
    return NextResponse.json({ submissionId, ncId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Error al guardar" },
      { status: 500 }
    );
  }
}
