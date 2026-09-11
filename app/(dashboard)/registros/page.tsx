import { redirect } from "next/navigation";
import { MonitoreoHub } from "@/components/production-records/monitoreo-hub";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { canManageQuality } from "@/lib/auth/permissions";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { isQrLinkActive } from "@/lib/production-records/qr";
import { createClient } from "@/lib/supabase/server";

export default async function RegistrosPage() {
  const orgId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");

  const canManage = canManageQuality(profile?.role);
  const supabase = await createClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ count: templateCount }, { data: qrData }, { count: recordsToday }] =
    await Promise.all([
      supabase
        .from("production_form_templates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("monitoring_qr_links")
        .select("expires_at, revoked_at")
        .eq("organization_id", orgId),
      supabase
        .from("production_form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("submitted_at", todayStart.toISOString()),
    ]);

  const activeQrCount = ((qrData ?? []) as { expires_at: string; revoked_at: string | null }[])
    .filter(isQrLinkActive).length;

  return (
    <MonitoreoHub
      templateCount={templateCount ?? 0}
      activeQrCount={activeQrCount}
      recordsToday={recordsToday ?? 0}
      canManage={canManage}
    />
  );
}
