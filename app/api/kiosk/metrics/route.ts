import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";
import { loadKioskSnapshot } from "@/lib/kiosk/snapshot";

export async function GET() {
  try {
    const { supabase, profile } = await requirePermission(
      PERMISSIONS.monitoring.read
    );
    const snapshot = await loadKioskSnapshot(supabase, profile.organization_id);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const mapped = authzResponse(error);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al cargar kiosco" },
      { status: 500 }
    );
  }
}
