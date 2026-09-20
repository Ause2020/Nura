import { redirect } from "next/navigation";
import { CapaDashboard } from "@/components/capa/capa-dashboard";
import { getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { startNavTimer, timeNav } from "@/lib/perf/dev-time";
import { rscNavCtx } from "@/lib/perf/rsc-nav";
import { createClient } from "@/lib/supabase/server";
import type { CapaAction, Nonconformity, Profile } from "@/types/database";

const NC_LIST_FIELDS =
  "id, nc_number, origin, description, severity, area, capa_stage, assigned_to, due_date, status, detected_at, closed_at, created_at, recurrence";

export default async function CapaPage() {
  const nav = await rscNavCtx("/capa");
  const endPage = startNavTimer("PAGE", "total", nav);
  const orgId = await requireOrganizationId();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const endQueries = startNavTimer("PAGE", "queries", nav);
  const [{ data: ncsData }, { data: actionsData }, { data: membersData }] =
    await Promise.all([
      timeNav("PAGE", "query nonconformities", nav, () =>
        supabase
          .from("nonconformities")
          .select(NC_LIST_FIELDS)
          .eq("organization_id", orgId)
          .order("detected_at", { ascending: false })
      ),
      timeNav("PAGE", "query capa_actions", nav, () =>
        supabase
          .from("capa_actions")
          .select("id, nc_id, status, responsible")
          .eq("organization_id", orgId)
      ),
      timeNav("PAGE", "query profiles", nav, () =>
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", orgId)
          .order("full_name")
      ),
    ]);
  endQueries();

  const ncs = (ncsData ?? []) as Nonconformity[];
  const actions = (actionsData ?? []) as CapaAction[];

  const actionsByNc: Record<string, CapaAction[]> = {};
  for (const action of actions) {
    if (!actionsByNc[action.nc_id]) actionsByNc[action.nc_id] = [];
    actionsByNc[action.nc_id].push(action);
  }

  endPage();
  return (
    <CapaDashboard
      ncs={ncs}
      actionsByNc={actionsByNc}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
    />
  );
}
