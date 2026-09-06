import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrganizationId } from "@/lib/haccp/auth";
import {
  generatePortalTokenValue,
} from "@/lib/suppliers/portal";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id: supplierId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await requireOrganizationId();
  } catch {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 403 });
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const token = generatePortalTokenValue();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const { error } = await supabase.from("supplier_portal_tokens").insert({
    supplier_id: supplierId,
    organization_id: orgId,
    token,
    expires_at: expiresAt.toISOString(),
    created_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  return NextResponse.json({
    url: `${baseUrl}/proveedor/${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: supplierId } = await params;
  const supabase = await createClient();
  const orgId = await requireOrganizationId();

  const { data } = await supabase
    .from("supplier_portal_tokens")
    .select("token, expires_at")
    .eq("supplier_id", supplierId)
    .eq("organization_id", orgId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ url: null });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  return NextResponse.json({
    url: `${baseUrl}/proveedor/${(data as { token: string }).token}`,
    expiresAt: (data as { expires_at: string }).expires_at,
  });
}
