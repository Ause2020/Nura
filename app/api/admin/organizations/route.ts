import { NextResponse } from "next/server";
import {
  listOrganizationsForAdmin,
  updateOrganizationAccess,
} from "@/lib/admin/provision";
import { requirePlatformAdmin } from "@/lib/access/platform-admin";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const organizations = await listOrganizationsForAdmin();
    return NextResponse.json({ organizations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = await request.json();

    await updateOrganizationAccess({
      organizationId: body.organizationId,
      accessStatus: body.accessStatus,
      accessExpiresAt: body.accessExpiresAt,
      contractNotes: body.contractNotes,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
