import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";
import { normalizeOrgLogoForWrite } from "@/lib/storage/org-logo";
import type { EmployeesRange, Industry } from "@/types/database";

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requirePermission(
      PERMISSIONS.settings.manage
    );
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
      try {
        patch.logo_url = normalizeOrgLogoForWrite(
          body.logo_url,
          profile.organization_id
        );
      } catch {
        return NextResponse.json({ error: "Logo inválido" }, { status: 400 });
      }
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
    const { body, status } = authzResponse(e);
    if (status !== 400) return NextResponse.json(body, { status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al guardar" },
      { status: 500 }
    );
  }
}
