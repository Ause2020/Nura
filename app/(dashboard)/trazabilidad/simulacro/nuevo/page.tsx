import { redirect } from "next/navigation";
import { StartMockRecallForm } from "@/components/traceability/start-mock-recall-form";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TraceLot } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoSimulacroPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: lotsData }, { data: membersData }] = await Promise.all([
    supabase
      .from("trace_lots")
      .select("*")
      .eq("organization_id", orgId)
      .order("lot_code"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .order("full_name"),
  ]);

  return (
    <StartMockRecallForm
      lots={(lotsData ?? []) as TraceLot[]}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
      organizationId={orgId}
      userId={user.id}
    />
  );
}
