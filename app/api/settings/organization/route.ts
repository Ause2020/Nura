import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";
import type { EmployeesRange, Industry } from "@/types/database";

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requireOrgAdmin();
    const body = await request.json();

    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
      }
      patch.name = name;
    }

    if (body.industry !== undefined) patch.industry = body.industry as Industry;
    if (body.country !== undefined) patch.country = String(body.country);
    if (body.city !== undefined) {
      patch.city = String(body.city).trim() || null;
    }
    if (body.employees_range !== undefined) {
      patch.employees_range = (body.employees_range || null) as EmployeesRange | null;
    }
    if (body.certifications !== undefined) {
      patch.certifications = Array.isArray(body.certifications)
        ? body.certifications
        : [];
    }
    if (body.logo_url !== undefined) {
      patch.logo_url = body.logo_url ? String(body.logo_url) : null;
    }
    if (body.complaint_response_sla_hours !== undefined) {
      const hours = Number(body.complaint_response_sla_hours);
      if (Number.isNaN(hours) || hours < 48 || hours > 72) {
        return NextResponse.json(
          { error: "SLA debe estar entre 48 y 72 horas" },
          { status: 400 }
        );
      }
      patch.complaint_response_sla_hours = Math.round(hours);
    }
    if (body.complaint_auto_nc_severity !== undefined) {
      const val = String(body.complaint_auto_nc_severity);
      if (!["none", "safety_critical", "quality"].includes(val)) {
        return NextResponse.json(
          { error: "Umbral NC automática inválido" },
          { status: 400 }
        );
      }
      patch.complaint_auto_nc_severity = val;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("organizations")
      .update(patch)
      .eq("id", profile.organization_id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ organization: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al guardar";
    const status = message.includes("administradores") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
