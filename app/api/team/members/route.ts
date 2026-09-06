import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";
import { listPendingInvitations, listTeamMembers } from "@/lib/team/list";

export async function GET() {
  try {
    const { profile } = await requireOrgAdmin();

    const [members, invitations] = await Promise.all([
      listTeamMembers(profile.organization_id),
      listPendingInvitations(profile.organization_id),
    ]);

    return NextResponse.json({ members, invitations });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message.includes("administradores") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
