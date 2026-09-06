import { redirect } from "next/navigation";
import { CapaDashboard } from "@/components/capa/capa-dashboard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { CapaAction, Nonconformity, Profile } from "@/types/database";

const NC_LIST_FIELDS =
  "id, nc_number, origin, description, severity, area, capa_stage, assigned_to, due_date, status, detected_at, closed_at, created_at, recurrence";

export default async function CapaPage() {
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const [{ data: ncsData }, { data: actionsData }, { data: membersData }] =
    await Promise.all([
      supabase
        .from("nonconformities")
        .select(NC_LIST_FIELDS)
        .eq("organization_id", orgId)
        .order("detected_at", { ascending: false }),
      supabase
        .from("capa_actions")
        .select("id, nc_id, status, responsible")
        .eq("organization_id", orgId),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("organization_id", orgId)
        .order("full_name"),
    ]);

  const ncs = (ncsData ?? []) as Nonconformity[];
  const actions = (actionsData ?? []) as CapaAction[];

  const actionsByNc: Record<string, CapaAction[]> = {};
  for (const action of actions) {
    if (!actionsByNc[action.nc_id]) actionsByNc[action.nc_id] = [];
    actionsByNc[action.nc_id].push(action);
  }

  return (
    <CapaDashboard
      ncs={ncs}
      actionsByNc={actionsByNc}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
    />
  );
}
