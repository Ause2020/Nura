import { redirect } from "next/navigation";
import { CreateNcForm } from "@/components/capa/create-nc-form";
import { generateNcNumber } from "@/lib/capa/utils";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevaNcPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ncNumber = await generateNcNumber(supabase, orgId);

  return (
    <CreateNcForm
      organizationId={orgId}
      userId={user.id}
      initialNcNumber={ncNumber}
    />
  );
}
