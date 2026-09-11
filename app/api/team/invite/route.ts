import { NextResponse } from "next/server";
import { isOrgRole } from "@/lib/auth/permissions";
import { authzResponse } from "@/lib/auth/require-permission";
import { requireOrgAdmin } from "@/lib/team/auth";
import {
  assertTeamCapacity,
  buildInvitationUrl,
  generateInvitationToken,
  isEmailInOrganization,
} from "@/lib/team/invitations";
import { ROLE_LABELS } from "@/lib/team/constants";
import type { UserRole } from "@/types/database";

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireOrgAdmin();
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const role = (body.role ?? "operator") as UserRole;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    if (!isOrgRole(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    await assertTeamCapacity(profile.organization_id);

    if (await isEmailInOrganization(email, profile.organization_id)) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese email en la organización" },
        { status: 409 }
      );
    }

    const { data: pendingInvite } = await supabase
      .from("invitations")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("email", email)
      .eq("accepted", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pendingInvite) {
      return NextResponse.json(
        { error: "Ya hay una invitación pendiente para ese email" },
        { status: 409 }
      );
    }

    const token = generateInvitationToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invitation, error } = await supabase
      .from("invitations")
      .insert({
        organization_id: profile.organization_id,
        email,
        role,
        token,
        invited_by: profile.id,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, email, role, token, expires_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = invitation as {
      id: string;
      email: string;
      role: UserRole;
      token: string;
      expires_at: string;
      created_at: string;
    };

    return NextResponse.json({
      invitation: row,
      inviteUrl: buildInvitationUrl(row.token),
      roleLabel: ROLE_LABELS[row.role],
    });
  } catch (e) {
    const mapped = authzResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "Error al invitar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
