import { redirect } from "next/navigation";
import { NewSupplierForm } from "@/components/suppliers/new-supplier-form";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoProveedorPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <NewSupplierForm organizationId={orgId} />;
}
