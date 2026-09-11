import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await requirePermission(
      PERMISSIONS.settings.manage
    );
    const body = await request.json();

    const patch: Record<string, boolean> = {};

    if (typeof body.email_capa_due === "boolean") {
      patch.email_capa_due = body.email_capa_due;
    }
    if (typeof body.email_weekly_summary === "boolean") {
      patch.email_weekly_summary = body.email_weekly_summary;
    }
    if (typeof body.email_audit_completed === "boolean") {
      patch.email_audit_completed = body.email_audit_completed;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("notification_preferences")
      .select("organization_id")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    let result;

    if (existing) {
      const { data, error } = await supabase
        .from("notification_preferences")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    } else {
      const { data, error } = await supabase
        .from("notification_preferences")
        .insert({
          organization_id: profile.organization_id,
          email_capa_due: patch.email_capa_due ?? true,
          email_weekly_summary: patch.email_weekly_summary ?? true,
          email_audit_completed: patch.email_audit_completed ?? false,
        })
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({ preferences: result });
  } catch (e) {
    const mapped = authzResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al guardar" },
      { status: 500 }
    );
  }
}
