import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateNcNumber } from "@/lib/capa/utils";
import { getSuggestedDueDate } from "@/lib/capa/utils";
import { computeCapaSignatureHash } from "@/lib/capa/workflow";
import { shouldQuarantineLot } from "@/lib/capa/quarantine";
import { notifyOrgManagers } from "@/lib/notifications";
import type { NcOrigin, NcSeverity } from "@/types/database";

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

  const formData = await req.formData();
  const description = String(formData.get("description") ?? "").trim();
  const severity = (formData.get("severity") as NcSeverity) ?? "major";
  const area = String(formData.get("area") ?? "").trim() || null;
  const lotNumber = String(formData.get("lot_number") ?? "").trim() || null;
  const origin: NcOrigin = "process";
  const photo = formData.get("photo") as File | null;

  if (!description)
    return NextResponse.json({ error: "Descripción requerida" }, { status: 400 });

  const ncNumber = await generateNcNumber(supabase, organizationId);
  const dueDate = getSuggestedDueDate(severity);
  const lotQuarantined = shouldQuarantineLot(severity, "major", lotNumber);

  const { data, error: insertError } = await supabase
    .from("nonconformities")
    .insert({
      organization_id: organizationId,
      nc_number: ncNumber,
      origin,
      description,
      severity,
      area,
      lot_number: lotNumber,
      detected_by: user.id,
      assigned_to: user.id,
      due_date: dueDate,
      capa_target_close_date: dueDate,
      status: "open",
      capa_stage: "identification",
      effectiveness_result: "pending",
      lot_quarantined: lotQuarantined,
    })
    .select("id")
    .single();

  if (insertError || !data)
    return NextResponse.json({ error: "Error al crear NC" }, { status: 500 });

  const ncId = (data as { id: string }).id;

  // Stage log
  const now = new Date().toISOString();
  const signatureHash = await computeCapaSignatureHash({
    userId: user.id,
    ncId,
    fromStage: null,
    toStage: "identification",
    timestamp: now,
  });
  await supabase.from("capa_stage_log").insert({
    organization_id: organizationId,
    nc_id: ncId,
    from_stage: null,
    to_stage: "identification",
    changed_by: user.id,
    comment: "NC registrada desde captura rápida",
    signature_hash: signatureHash,
  });

  // Upload photo if provided
  if (photo && photo.size > 0) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const path = `${organizationId}/${ncId}/quick-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("nc-photos")
      .upload(path, buffer, { contentType: photo.type, upsert: true });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("nc-photos")
        .getPublicUrl(path);
      await supabase.from("nc_photos").insert({
        nc_id: ncId,
        organization_id: organizationId,
        photo_url: urlData.publicUrl,
        description: "Captura rápida",
      });
    }
  }

  await notifyOrgManagers(supabase, organizationId, {
    type: "nc_new",
    title: "Nueva no conformidad",
    message: `${ncNumber}: ${description.slice(0, 80)}`,
    link: `/capa/${ncId}`,
    dedupKey: `nc-new-${ncId}`,
  });

  return NextResponse.json({ ncId, ncNumber });
}
