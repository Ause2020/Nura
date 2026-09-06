import { NextResponse } from "next/server";
import { provisionClient } from "@/lib/admin/provision";
import { requirePlatformAdmin } from "@/lib/access/platform-admin";
import type { Industry, UserRole } from "@/types/database";

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await request.json();

    const result = await provisionClient({
      organizationName: body.organizationName,
      industry: body.industry as Industry,
      country: body.country,
      city: body.city,
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      role: (body.role as UserRole) ?? "admin",
      jobTitle: body.jobTitle,
      contractNotes: body.contractNotes,
      accessExpiresAt: body.accessExpiresAt,
      skipOnboarding: body.skipOnboarding ?? true,
      provisionedBy: admin.userId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al provisionar";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
