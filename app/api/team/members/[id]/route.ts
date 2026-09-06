import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";
import { removeTeamMember, updateMemberRole } from "@/lib/team/members";
import type { UserRole } from "@/types/database";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { profile } = await requireOrgAdmin();
    const { id } = await params;
    const body = await request.json();
    const role = body.role as UserRole;

    if (!["admin", "quality_manager", "operator"].includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    await updateMemberRole(
      profile.organization_id,
      id,
      profile.id,
      role
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al actualizar rol";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { profile } = await requireOrgAdmin();
    const { id } = await params;

    await removeTeamMember(profile.organization_id, id, profile.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al eliminar usuario";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
