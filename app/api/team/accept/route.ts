import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  acceptInvitation,
  acceptInvitationForExistingUser,
} from "@/lib/team/invitations";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const fullName = String(body.fullName ?? "").trim();
    const password = String(body.password ?? "");

    if (!token) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const result = await acceptInvitationForExistingUser(
        token,
        user.id,
        user.email ?? ""
      );
      return NextResponse.json(result);
    }

    if (!fullName || !password) {
      return NextResponse.json(
        { error: "Nombre y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const result = await acceptInvitation({ token, fullName, password });
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al aceptar invitación";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
