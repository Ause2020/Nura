import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";
import { createNotification, notifyOrgManagers } from "@/lib/notifications";
import type { Nonconformity } from "@/types/database";

export async function POST() {
  let supabase;
  let orgId: string;
  try {
    const session = await requirePermission(PERMISSIONS.capa.manage);
    supabase = session.supabase;
    orgId = session.profile.organization_id;
  } catch (error) {
    const { body, status } = authzResponse(error);
    return NextResponse.json(body, { status });
  }

  const today = new Date().toISOString().split("T")[0];

  const { data: overdueActions } = await supabase
    .from("capa_actions")
    .select("id, nc_id, responsible, description")
    .eq("organization_id", orgId)
    .lt("due_date", today)
    .neq("status", "completed");

  const actionIds = (overdueActions ?? []).map((a) => (a as { id: string }).id);

  if (actionIds.length > 0) {
    await supabase
      .from("capa_actions")
      .update({ status: "overdue" })
      .in("id", actionIds);
  }

  const { data: overdueNcs } = await supabase
    .from("nonconformities")
    .select("id, nc_number, assigned_to, description")
    .eq("organization_id", orgId)
    .lt("due_date", today)
    .not("status", "eq", "closed");

  const ncIds = (overdueNcs ?? []).map((n) => (n as { id: string }).id);

  if (ncIds.length > 0) {
    await supabase
      .from("nonconformities")
      .update({ status: "overdue" })
      .in("id", ncIds);
  }

  for (const nc of (overdueNcs ?? []) as Nonconformity[]) {
    if (nc.assigned_to) {
      await createNotification(supabase, {
        organizationId: orgId,
        userId: nc.assigned_to,
        type: "capa_overdue",
        title: "CAPA vencida",
        message: `${nc.nc_number} superó la fecha límite`,
        link: `/capa/${nc.id}`,
        dedupKey: `capa-overdue-nc-${nc.id}`,
      });
    }

    await notifyOrgManagers(supabase, orgId, {
      type: "capa_overdue",
      title: "NC vencida — escalamiento",
      message: `${nc.nc_number}: requiere atención del responsable`,
      link: `/capa/${nc.id}`,
      dedupKey: `capa-overdue-mgr-${nc.id}`,
    });
  }

  for (const action of overdueActions ?? []) {
    const row = action as {
      id: string;
      nc_id: string;
      responsible: string;
      description: string;
    };
    await notifyOrgManagers(supabase, orgId, {
      type: "capa_overdue",
      title: "Acción CAPA vencida",
      message: `${row.responsible}: ${row.description.slice(0, 60)}`,
      link: `/capa/${row.nc_id}`,
      dedupKey: `capa-overdue-action-${row.id}`,
    });
  }

  return NextResponse.json({
    escalated_actions: actionIds.length,
    escalated_ncs: ncIds.length,
  });
}
