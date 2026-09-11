import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";
import { exportOrganizationData } from "@/lib/settings/export";

export async function GET() {
  try {
    const { profile } = await requirePermission(PERMISSIONS.settings.manage);
    const bundle = await exportOrganizationData(profile.organization_id);

    const filename = `nura-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const mapped = authzResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "Error al exportar";
    const status = 500;
    return NextResponse.json({ error: message }, { status });
  }
}
