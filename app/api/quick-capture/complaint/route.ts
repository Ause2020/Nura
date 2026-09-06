import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeResponseDueAt, parseSlaHours } from "@/lib/complaints/sla";
import { logComplaintStatusChange } from "@/lib/complaints/status-log";
import { autoCreateNcFromComplaintIfNeeded } from "@/lib/integrations/auto-nc-from-complaint";
import type { ComplaintSeverity, ComplaintType } from "@/types/database";

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

  // Fetch complaint number and SLA settings
  const year = new Date().getFullYear();
  const prefix = `RC-${year}-`;
  const { data: lastData } = await supabase
    .from("customer_complaints")
    .select("complaint_number")
    .eq("organization_id", organizationId)
    .like("complaint_number", `${prefix}%`)
    .order("complaint_number", { ascending: false })
    .limit(1);

  const last = (lastData as { complaint_number: string }[] | null)?.[0]
    ?.complaint_number;
  const lastNum = last ? parseInt(last.split("-").pop() ?? "0", 10) : 0;
  const complaintNumber = `${prefix}${String(lastNum + 1).padStart(3, "0")}`;

  const { data: settingsData } = await supabase
    .from("complaint_settings")
    .select("response_sla_hours")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const slaHours = parseSlaHours(
    (settingsData as { response_sla_hours?: unknown } | null)?.response_sla_hours
  );

  const formData = await req.formData();
  const description = String(formData.get("description") ?? "").trim();
  const complaintType = (formData.get("complaint_type") as ComplaintType) ?? "other";
  const severity = (formData.get("severity") as ComplaintSeverity) ?? "quality";
  const customerName = String(formData.get("customer_name") ?? "").trim() || "Sin especificar";
  const lotNumber = String(formData.get("lot_number") ?? "").trim() || null;
  const photo = formData.get("photo") as File | null;

  if (!description)
    return NextResponse.json({ error: "Descripción requerida" }, { status: 400 });

  const today = new Date().toISOString().split("T")[0];
  const responseDueAt = computeResponseDueAt(today, slaHours);

  const { data, error: insertError } = await supabase
    .from("customer_complaints")
    .insert({
      organization_id: organizationId,
      complaint_number: complaintNumber,
      received_date: today,
      channel: "other",
      customer_name: customerName,
      lot_number: lotNumber,
      complaint_type: complaintType,
      severity,
      description,
      status: "open",
      recurrence: false,
      response_due_at: responseDueAt,
      response_responsible: user.id,
    })
    .select("id")
    .single();

  if (insertError || !data)
    return NextResponse.json({ error: "Error al crear reclamo" }, { status: 500 });

  const complaintId = (data as { id: string }).id;

  await logComplaintStatusChange(supabase, {
    complaintId,
    organizationId,
    fromStatus: null,
    toStatus: "open",
    changedBy: user.id,
    comment: "Reclamo registrado desde captura rápida",
  });

  await autoCreateNcFromComplaintIfNeeded(supabase, {
    organizationId,
    userId: user.id,
    complaintId,
    complaintNumber,
    description,
    severity,
    lotNumber,
    productName: null,
    autoNcThreshold: null,
  });

  // Upload photo
  if (photo && photo.size > 0) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const path = `${organizationId}/${complaintId}/quick-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await photo.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("complaint-photos")
      .upload(path, buffer, { contentType: photo.type, upsert: true });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("complaint-photos")
        .getPublicUrl(path);
      await supabase.from("complaint_photos").insert({
        complaint_id: complaintId,
        organization_id: organizationId,
        photo_url: urlData.publicUrl,
        description: "Captura rápida",
      });
    }
  }

  return NextResponse.json({ complaintId, complaintNumber });
}
