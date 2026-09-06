import { NextResponse } from "next/server";
import { provisionUser } from "@/lib/admin/provision";
import { requirePlatformAdmin } from "@/lib/access/platform-admin";
import type { UserRole } from "@/types/database";

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = await request.json();

    const result = await provisionUser({
      organizationId: body.organizationId,
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      role: (body.role as UserRole) ?? "quality_manager",
      jobTitle: body.jobTitle,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear usuario";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
