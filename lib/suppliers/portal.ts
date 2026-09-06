import { createAdminClient } from "@/lib/supabase/admin";
import type { Supplier, SupplierPortalToken } from "@/types/database";

export interface PortalContext {
  token: SupplierPortalToken;
  supplier: Supplier;
  organizationName: string;
}

export async function getPortalByToken(
  token: string
): Promise<PortalContext | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("supplier_portal_tokens")
    .select("*, suppliers(*), organizations(name)")
    .eq("token", token.trim())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as SupplierPortalToken & {
    suppliers: Supplier | Supplier[] | null;
    organizations: { name: string } | { name: string }[] | null;
  };

  const supplier = Array.isArray(row.suppliers)
    ? row.suppliers[0]
    : row.suppliers;
  const org = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  if (!supplier || !org) return null;

  return {
    token: row,
    supplier,
    organizationName: org.name,
  };
}

export function isPortalTokenValid(token: SupplierPortalToken): boolean {
  return new Date(token.expires_at).getTime() > Date.now();
}

export function generatePortalTokenValue(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
