import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDocStatus } from "@/lib/suppliers/utils";
import {
  getPortalByToken,
  isPortalTokenValid,
} from "@/lib/suppliers/portal";
import type { SupplierDocType } from "@/types/database";

export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Servicio no disponible" },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  const docType = String(form.get("doc_type") ?? "") as SupplierDocType;
  const docName = String(form.get("doc_name") ?? "").trim();
  const expiryDate = String(form.get("expiry_date") ?? "") || null;
  const file = form.get("file") as File | null;

  if (!token || !docName || !file || file.size === 0) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx. 10 MB)" }, { status: 400 });
  }

  const context = await getPortalByToken(token);
  if (!context || !isPortalTokenValid(context.token)) {
    return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 403 });
  }

  const { supplier, token: portalToken } = context;
  const orgId = supplier.organization_id;
  const path = `${orgId}/${supplier.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("supplier-docs")
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from("supplier-docs").getPublicUrl(path);
  const status = computeDocStatus(expiryDate);

  const { error: insertError } = await admin.from("supplier_documents").insert({
    supplier_id: supplier.id,
    organization_id: orgId,
    doc_type: docType,
    doc_name: docName,
    file_url: urlData.publicUrl,
    expiry_date: expiryDate,
    status,
    review_status: "pending_review",
    portal_upload: true,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, supplierId: supplier.id });
}
