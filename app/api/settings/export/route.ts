import { NextResponse } from "next/server";
import { exportOrganizationData } from "@/lib/settings/export";
import { requireOrgAdmin } from "@/lib/team/auth";

export async function GET() {
  try {
    const { profile } = await requireOrgAdmin();
    const bundle = await exportOrganizationData(profile.organization_id);

    const filename = `nura-export-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al exportar";
    const status = message.includes("administradores") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
