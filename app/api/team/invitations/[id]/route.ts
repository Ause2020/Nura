import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, profile } = await requireOrgAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from("invitations")
      .delete()
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .eq("accepted", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al cancelar invitación";
    const status = message.includes("administradores") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
