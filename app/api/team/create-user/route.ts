import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";
import { assertTeamCapacity } from "@/lib/team/invitations";
import { createTeamMember } from "@/lib/team/members";
import type { UserRole } from "@/types/database";

export async function POST(request: Request) {
  try {
    const { profile } = await requireOrgAdmin();
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    const role = (body.role ?? "operator") as UserRole;

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: "Email, nombre y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    if (!["admin", "quality_manager", "operator"].includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }

    await assertTeamCapacity(profile.organization_id);

    const result = await createTeamMember({
      organizationId: profile.organization_id,
      email,
      password,
      fullName,
      role,
    });

    return NextResponse.json({ user: result });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al crear usuario";
    const status = message.includes("administradores")
      ? 403
      : message.includes("registrado") || message.includes("Límite")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
